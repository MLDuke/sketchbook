# 0002. Three Vite globs: notes and media eager, sketches lazy, all literal

Status: Accepted · 2026-09-03

## Context
The playground has to list every entry with its title and thumbnail, but only
needs to compile the sketch you open. `playground/src/sketches.ts` finds
everything with `import.meta.glob`.

## Decision
Three globs, deliberately different:
- Notes (`index.md`, as raw text) and media (as URLs) are `eager: true`. The
  index needs every title and thumbnail up front.
- Sketch modules (`src/index.{jsx,tsx,js,ts}`) are lazy, one chunk each.
- All three patterns are string literals. Vite analyses globs statically and
  can't take them from a variable.

## Consequences
- Dev-server startup stays flat as the collection grows. Making the sketch glob
  eager would compile every sketch on every start.
- The extension lists in the globs are a second copy of `MEDIA_EXTENSIONS` and
  `SOURCE_EXTENSIONS` in `scripts/lib/entry.mjs`. A test in `entry.test.mjs`
  fails if they drift, so a new extension is added in both places
  ([0012](0012-lowercase-media-extensions.md)).
- The playground can only list what the globs matched, so its view of an entry's
  folder is partial ([0011](0011-invalid-entries-render-with-problems.md)).
