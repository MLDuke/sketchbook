import type { ComponentType } from "react";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

export type SketchType = "image" | "code" | "mixed";

export interface SketchMedia {
  src: string;
  alt?: string;
  caption?: string;
  /** Resolved bundler URL, present only when the file exists on disk. */
  url?: string;
}

export interface Sketch {
  /** Folder name, e.g. "2026-09-03-spring-grid" — also the hash route. */
  dir: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  type: SketchType;
  publish: boolean;
  /** Markdown body of index.md, after the frontmatter block. */
  note: string;
  media: SketchMedia[];
  /** Frontmatter parse warnings, surfaced in the UI as-is. */
  problems: string[];
  /**
   * Dynamic import of the sketch's `src/index.{jsx,tsx}`, or undefined when the
   * entry has no runnable source yet. Each one is a separate lazy chunk, so a
   * sketch is only fetched and compiled when you open it.
   */
  load?: () => Promise<{ default: ComponentType }>;
}

// Notes and media are cheap and needed up front for the index, so eager. Sketch
// modules stay lazy — that is what keeps startup flat as the collection grows.
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

const DIR_RE = /\/entries\/([^/]+)\//;

function dirOf(globPath: string): string {
  return globPath.match(DIR_RE)?.[1] ?? "";
}

function bodyOf(md: string): string {
  const lines = md.split("\n");
  if (lines[0]?.trim() !== "---") return md.trim();
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  return end === -1 ? "" : lines.slice(end + 1).join("\n").trim();
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export const sketches: Sketch[] = Object.entries(noteFiles)
  .map(([globPath, raw]): Sketch => {
    const dir = dirOf(globPath);
    const prefix = `../../entries/${dir}/`;
    const parsed = parseFrontmatter(raw);
    const data = parsed?.data ?? {};

    const rawMedia = Array.isArray(data.media) ? (data.media as SketchMedia[]) : [];
    const media = rawMedia.map((m) => ({
      ...m,
      url: m?.src ? mediaFiles[prefix + m.src] : undefined,
    }));

    const modKey = Object.keys(sketchModules).find((k) =>
      k.startsWith(`${prefix}src/index.`),
    );

    const type = (["image", "code", "mixed"] as const).includes(data.type as SketchType)
      ? (data.type as SketchType)
      : "image";

    return {
      dir,
      slug: str(data.slug, dir),
      title: str(data.title, dir),
      description: str(data.description),
      date: str(data.date, dir.slice(0, 10)),
      type,
      publish: data.publish === true,
      note: bodyOf(raw),
      media,
      problems: parsed?.problems ?? [],
      load: modKey ? sketchModules[modKey] : undefined,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.dir.localeCompare(b.dir));
