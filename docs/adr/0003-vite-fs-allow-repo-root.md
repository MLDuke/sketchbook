# 0003. Vite serves from the repo root (`server.fs.allow`)

Status: Accepted · 2026-09-03

## Context
The playground's Vite root is `playground/`, but it reads `../entries` (notes,
media, sketch source) and `../scripts/lib/entry.mjs`. Vite refuses to serve files
outside its root by default.

## Decision
`playground/vite.config.ts` sets `server.fs.allow: [repoRoot]`, where `repoRoot`
is the parent of `playground/`.

## Consequences
- Remove it and every sketch returns 403 in dev. The failure looks like a broken
  sketch, not a broken config.
- The playground and the sketches can't be separated into different roots without
  revisiting this and [0002](0002-three-vite-globs.md).
