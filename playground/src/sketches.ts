import type { ComponentType } from "react";
import {
  readEntry,
  type Entry,
  type EntryFile,
  type EntryMedia,
  type Problem,
} from "../../scripts/lib/entry.mjs";

export interface SketchMedia extends EntryMedia {
  /** Resolved bundler URL, present only when the file exists on disk. */
  url?: string;
}

/**
 * An Entry as the Entry module read it (nothing defaulted: an invalid entry has
 * empty fields and `problems` says why), plus what the playground adds.
 */
export interface Sketch extends Omit<Entry, "media"> {
  media: SketchMedia[];
  /** Everything wrong with the entry, as judged by the Entry module. */
  problems: Problem[];
  /**
   * Dynamic import of the sketch's `src/index.*`, or undefined when the entry
   * has no runnable source yet. Each one is a separate lazy chunk, so a sketch
   * is only fetched and compiled when you open it.
   */
  load?: () => Promise<{ default: ComponentType }>;
}

// Notes and media are cheap and needed up front for the index, so eager. Sketch
// modules stay lazy — that is what keeps startup flat as the collection grows.
// Keep all three globs literal (Vite analyses them statically), and in agreement
// with MEDIA_EXTENSIONS / SOURCE_EXTENSIONS in entry.mjs; entry.test.mjs fails
// if they drift.
const noteFiles = import.meta.glob("../../entries/*/index.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const mediaFiles = import.meta.glob(
  "../../entries/*/*.{png,gif,jpg,jpeg,webp,avif,svg}",
  { query: "?url", import: "default", eager: true },
) as Record<string, string>;

const sketchModules = import.meta.glob(
  "../../entries/*/src/index.{jsx,tsx,js,ts}",
) as Record<string, () => Promise<{ default: ComponentType }>>;

const DIR_RE = /\/entries\/([^/]+)\/(.+)$/;

// The browser can't list a folder or stat a file, so each entry's file listing
// is rebuilt from what the globs matched. That's a partial listing without
// sizes, which the Entry module is told about (`partial`), so it skips the
// checks that need either.
function filesByDir(...globs: Record<string, unknown>[]): Map<string, EntryFile[]> {
  const byDir = new Map<string, EntryFile[]>();
  for (const key of globs.flatMap(Object.keys)) {
    const match = key.match(DIR_RE);
    if (!match) continue;
    const [, dir, path] = match;
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push({ path });
  }
  return byDir;
}

const files = filesByDir(noteFiles, mediaFiles, sketchModules);

export const sketches: Sketch[] = Object.entries(noteFiles)
  .map(([globPath, indexMd]): Sketch => {
    const dir = globPath.match(DIR_RE)![1];
    const prefix = `../../entries/${dir}/`;
    const { entry, problems } = readEntry({
      dir,
      indexMd,
      files: files.get(dir) ?? [],
      partial: true,
    });

    return {
      ...entry,
      media: entry.media.map((m) => ({
        ...m,
        url: m.src ? mediaFiles[prefix + m.src] : undefined,
      })),
      problems,
      load: entry.sourceFile ? sketchModules[prefix + entry.sourceFile] : undefined,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.dir.localeCompare(b.dir));
