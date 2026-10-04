# 0012. Media extensions are lowercase only

Status: Accepted · 2026-10-03

## Context
The media glob in `sketches.ts` is literal and case-sensitive
([0002](0002-three-vite-globs.md)). An uppercase `.PNG` was weight-checked
by validation, but the playground never loaded it, so the file sat on disk and
nowhere on screen.

## Decision
An uppercase media extension is an error, for drafts too, and the message says
what to rename it to. The glob stays literal and lowercase rather than growing
every case variant or a case-insensitive workaround.

## Consequences
- The rule agrees with the lowercase-kebab naming convention for media files
  ([guide](../authoring-sketches.md#media)), so it rarely surprises anyone.
- Adding an extension means editing `MEDIA_EXTENSIONS` in `entry.mjs` and the glob
  in `sketches.ts` together. A test fails if they disagree.
- The rule itself is in the [README](../../README.md#frontmatter-schema).
