// Types for entry.mjs. The module stays plain JS so the playground, the
// validator and the scaffold can all import the one implementation; this file
// is what gives the TypeScript side real types. Keep it in sync by hand.

export type EntryType = "image" | "code" | "mixed";

export const ENTRY_TYPES: readonly EntryType[];
export const REQUIRED_FIELDS: readonly string[];
export const MEDIA_EXTENSIONS: readonly string[];
export const SOURCE_EXTENSIONS: readonly string[];
export const MEDIA_WARN_BYTES: number;
export const MEDIA_ERROR_BYTES: number;

export function isEntryType(value: unknown): value is EntryType;
/** True for code and mixed, the types that have a sketch under src/. */
export function typeNeedsSource(type: EntryType | undefined): boolean;
export function slugify(title: string): string;
/** The folder-name rule: `${date}-${slug}`. */
export function entryDirName(date: string, slug: string): string;
/** The sketch file in a listing (`src/index.<ext>`), or undefined if there isn't one. */
export function findSourceFile(files: readonly { path: string }[]): string | undefined;

export interface EntryMedia {
  /** Path relative to the entry folder; "" when the item has none. */
  src: string;
  /** "" when absent. */
  alt: string;
  /** "" when absent. */
  caption: string;
}

/**
 * An entry as read. Nothing is defaulted: a missing or invalid field reads as
 * "" (text), undefined (type, sourcePath, sourceFile) or false (publish), and
 * the accompanying problems say why.
 */
export interface Entry {
  /** Folder name, e.g. "2026-09-03-spring-grid" — also the playground's route. */
  dir: string;
  title: string;
  description: string;
  date: string;
  slug: string;
  /** undefined when missing or not one of ENTRY_TYPES. */
  type: EntryType | undefined;
  /** True only for a literal `publish: true`. */
  publish: boolean;
  media: EntryMedia[];
  /** The frontmatter `sourcePath`, as written. */
  sourcePath: string | undefined;
  /** The sketch file, e.g. "src/index.tsx"; undefined if the entry has none yet. */
  sourceFile: string | undefined;
  /** Markdown body of index.md, after the frontmatter block. */
  note: string;
}

export type ProblemCode =
  // structural: every entry
  | "missing-index"
  | "no-frontmatter"
  | "frontmatter-syntax"
  | "missing-field"
  | "bad-field"
  | "invalid-type"
  | "invalid-date"
  | "invalid-publish"
  | "bad-media"
  | "folder-name"
  | "media-uppercase-extension"
  | "media-too-heavy"
  | "media-heavy"
  | "no-default-export"
  // content: publish: true only
  | "no-description"
  | "no-media"
  | "media-no-src"
  | "media-no-alt"
  | "media-missing"
  | "no-source-file"
  | "no-source-path"
  | "source-path-missing"
  | "source-path-empty";

export interface Problem {
  level: "error" | "warning";
  code: ProblemCode;
  message: string;
  /** Path the problem is about, relative to the entry folder ("." for the folder itself). */
  file: string;
}

export interface EntryFile {
  /** Relative to the entry folder, "/"-separated: "index.md", "foo.gif", "src/index.tsx". */
  path: string;
  /** Bytes. Omit when unknown; the weight checks skip files without one. */
  size?: number;
}

export interface EntryInput {
  /** The folder name, e.g. "2026-09-03-spring-grid". */
  dir: string;
  /** Text of index.md; null or undefined when the file is missing. */
  indexMd: string | null | undefined;
  /** Every file in the entry folder (or, with `partial`, the ones the adapter can see). */
  files: readonly EntryFile[];
  /** Text of the file findSourceFile(files) picks; omit to skip the default-export check. */
  source?: string;
  /**
   * `files` is a subset of what's on disk, so absence proves nothing: skips the
   * "does not exist" checks for media and sourcePath. The browser adapter sets this.
   */
  partial?: boolean;
}

export interface ReadEntryResult {
  entry: Entry;
  problems: Problem[];
}

/**
 * Reads one entry and judges it. Structural checks run on every entry; content
 * checks run only when `publish: true`.
 */
export function readEntry(input: EntryInput): ReadEntryResult;

export interface FrontmatterFields {
  title: string;
  description?: string;
  date: string;
  slug: string;
  type: EntryType;
  publish?: boolean;
  media?: readonly { src: string; alt?: string; caption?: string }[];
  sourcePath?: string;
}

/**
 * Writes the frontmatter block (`---` fences included) with the scaffold's
 * explanatory comments. readEntry reads back whatever this writes. Throws on a
 * `type` outside ENTRY_TYPES.
 */
export function serializeFrontmatter(fields: FrontmatterFields): string;
