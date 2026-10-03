# 0005. `vercel.json` sets `framework: null`

Status: Accepted · 2026-09-03

## Context
Vercel previews the playground for pull requests. The repo root has a
`package.json`, but it is not a framework project: the app lives in
`playground/` and builds with `vite build playground`.

## Decision
`vercel.json` sets `"framework": null` and names the build command
(`npm run build:playground`) and output directory (`playground/dist`)
explicitly, rather than letting Vercel detect a preset.

## Consequences
- Do not remove `framework: null` as noise. The repo root isn't a framework
  project, so the build command and output directory have to say where the
  playground is.
- A preview deploy exposes every entry, drafts included. Never configure one
  without access control (see [0001](0001-publish-flag-on-main.md)).
