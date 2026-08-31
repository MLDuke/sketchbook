# sketchbook

Raw lab notebook for design and code explorations — static images, GIFs, small UI code snippets. This repo is the source of truth for everything; [portfolio-site](https://github.com/MLDuke/portfolio-site)'s `/journal` section pulls in only the entries marked `publish: true`.

## Structure

```
entries/
  2026-08-31-scroll-snap-experiment/
    index.md       # frontmatter + a short note
    *.gif / *.png  # media, co-located with the entry
    src/           # present for type: code | mixed — the actual sketch source
```

Entries are dated so the repo is browsable and sortable straight from GitHub's file view.

## Frontmatter schema

```yaml
---
title: "Scroll snap experiment"
date: "2026-08-31"
slug: "scroll-snap-experiment"
type: image        # image | code | mixed
publish: false      # only true entries reach the portfolio site
sourcePath: "src/"  # only present for type: code | mixed
---
```

No tags/categories for now — add them later if the collection grows enough to need filtering.

## Workflow

1. Build the sketch wherever's fastest (this doesn't need to happen in this repo).
2. `npm run new` — prompts for a title and type, creates the dated entry folder and frontmatter stub (plus `src/` if the type needs it).
3. Drop in media, and source under `src/` if applicable.
4. Fill in `index.md`.
5. When it's ready to share, flip `publish: true` and push to `main`.

Everything defaults to unpublished — most entries can just stay private-by-convention in this public repo. Publishing is a one-line, one-push action; nothing else needs to change in `portfolio-site` for it to show up (see `.github/workflows/deploy-portfolio.yml`, which needs a `VERCEL_DEPLOY_HOOK_URL` secret set once `portfolio-site` has one).

## What this repo does not do

- No syntax-highlighted code rendering — `portfolio-site` only ever links out to a file here. Source code in `src/` is never fetched or copied by the portfolio build.
- No video — GIFs cover motion for now; large binaries aren't worth the repo bloat yet.
