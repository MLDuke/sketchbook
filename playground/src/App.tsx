import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { typeNeedsSource, type Problem } from "../../scripts/lib/entry.mjs";
import { sketches, type Sketch } from "./sketches";
import { DevOverlays } from "./devtools";

// One React.lazy per sketch, memoised so navigating away and back does not throw
// away the already-loaded chunk.
const lazyCache = new Map<string, ComponentType>();
function lazyFor(sketch: Sketch): ComponentType | null {
  if (!sketch.load) return null;
  let C = lazyCache.get(sketch.dir);
  if (!C) {
    C = lazy(sketch.load);
    lazyCache.set(sketch.dir, C);
  }
  return C;
}

// An invalid entry can be missing its title, date or type. Label it with what
// is there rather than a blank link; its problems are shown alongside.
const titleOf = (s: Sketch) => s.title || s.dir;
const metaOf = (s: Sketch, extra: string[] = []) =>
  [s.date, s.type, ...extra].filter(Boolean).join(" · ");

function problemSummary(problems: Problem[]): string {
  return problems
    .map((p) => `${p.level}: ${p.file === "index.md" ? "" : `${p.file}: `}${p.message}`)
    .join("\n");
}

function useHashRoute(): string {
  const [route, setRoute] = useState(() => currentRoute());
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

function currentRoute(): string {
  return decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
}

class SketchBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <pre className="panel panel--error">
          {String(this.state.error.stack ?? this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

function Stage({ sketch }: { sketch: Sketch }) {
  const Sketch = lazyFor(sketch);
  const hasMedia = sketch.media.some((m) => m.url);

  return (
    <article className="stage">
      <header className="stage__head">
        <h1>{titleOf(sketch)}</h1>
        <p className="stage__meta">{metaOf(sketch, sketch.publish ? ["published"] : [])}</p>
        {sketch.description && <p className="stage__desc">{sketch.description}</p>}
      </header>

      {sketch.problems.length > 0 && (
        <pre className="panel panel--warn">
          This entry has problems:
          {"\n"}
          {problemSummary(sketch.problems)}
        </pre>
      )}

      {Sketch ? (
        <div className="canvas">
          {/* key remounts the sketch (and resets the boundary) on navigation */}
          <SketchBoundary key={sketch.dir}>
            <Suspense fallback={<div className="canvas__loading">loading sketch…</div>}>
              <Sketch />
            </Suspense>
          </SketchBoundary>
        </div>
      ) : hasMedia ? (
        <div className="media">
          {sketch.media.map(
            (m, i) =>
              m.url && (
                <figure key={i}>
                  <img src={m.url} alt={m.alt ?? ""} loading="lazy" />
                  {m.caption && <figcaption>{m.caption}</figcaption>}
                </figure>
              ),
          )}
        </div>
      ) : (
        <p className="panel">
          {typeNeedsSource(sketch.type) ? (
            <>
              No <code>src/index.tsx</code> yet — add one that{" "}
              <code>export default</code>s a React component.
            </>
          ) : (
            <>
              No media yet — drop a PNG/GIF next to <code>index.md</code> and list
              it under <code>media:</code>.
            </>
          )}
        </p>
      )}

      {sketch.note && <div className="note">{sketch.note}</div>}
    </article>
  );
}

function Index() {
  return (
    <div className="index">
      <h1>sketchbook</h1>
      <p className="index__lead">
        {sketches.length} {sketches.length === 1 ? "entry" : "entries"}. Code and
        mixed entries render live; image entries show their media.
      </p>
      <ul className="index__grid">
        {sketches.map((s) => {
          const thumb = s.media.find((m) => m.url)?.url;
          return (
            <li key={s.dir}>
              <a href={`#/${s.dir}`}>
                <div className="index__thumb" data-type={s.type}>
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span>{s.type ?? "?"}</span>}
                </div>
                <span className="index__title">{titleOf(s)}</span>
                <span className="index__meta">{s.date}</span>
                {s.problems.length > 0 && (
                  <span className="index__warn" title={problemSummary(s.problems)}>
                    {s.problems.length} {s.problems.length === 1 ? "problem" : "problems"}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      {sketches.length === 0 && (
        <p className="panel">
          No entries yet — run <code>npm run new</code> to scaffold one.
        </p>
      )}
    </div>
  );
}

export function App() {
  const route = useHashRoute();
  const current = sketches.find((s) => s.dir === route) ?? null;

  return (
    <div className="app">
      <nav className="sidebar">
        <a className="sidebar__brand" href="#/">
          sketchbook
        </a>
        <ul className="sidebar__list">
          {sketches.map((s) => (
            <li key={s.dir}>
              <a
                href={`#/${s.dir}`}
                className={s.dir === route ? "is-active" : undefined}
              >
                <span className="sidebar__title">{titleOf(s)}</span>
                <span className="sidebar__meta">{metaOf(s)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main">{current ? <Stage sketch={current} /> : <Index />}</main>

      <DevOverlays />
    </div>
  );
}
