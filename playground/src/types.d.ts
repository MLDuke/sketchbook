// Compile-time flags injected by vite.config.ts (`define`).
declare const __DIALKIT_ENABLED__: boolean;
declare const __AGENTATION_ENABLED__: boolean;

// The frontmatter parser is plain ESM shared with scripts/; give it a type face
// here so the playground stays type-checked without pulling scripts/ into tsc.
declare module "*frontmatter.mjs" {
  export function parseScalar(raw: string): unknown;
  export function parseFrontmatter(
    text: string,
  ): { data: Record<string, unknown>; problems: string[] } | null;
}
