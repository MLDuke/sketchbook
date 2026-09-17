// Types for frontmatter.mjs. The parser stays plain JS so the playground, the
// validator and the scaffold can all import the one implementation; this file
// is what stops `data` from arriving as `{}` on the TypeScript side.
//
// Keys mirror the schema documented in README.md. All are optional: the parser
// reports what it found, and validate-entries.mjs is what decides whether a
// given entry is allowed to be missing one.

export interface FrontmatterMedia {
  src?: string;
  alt?: string;
  caption?: string;
}

export interface FrontmatterData {
  title?: string;
  description?: string;
  date?: string;
  slug?: string;
  type?: string;
  publish?: boolean;
  media?: FrontmatterMedia[];
  sourcePath?: string;
  /** Unknown keys are kept rather than dropped, so the validator can flag them. */
  [key: string]: unknown;
}

export interface Frontmatter {
  data: FrontmatterData;
  problems: string[];
}

export function parseScalar(raw: string): string | boolean | unknown[];

/** Returns null when the text has no frontmatter block at all. */
export function parseFrontmatter(text: string): Frontmatter | null;
