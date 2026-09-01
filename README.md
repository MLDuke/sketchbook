# sketchbook

Raw lab notebook for design and code explorations — static images, GIFs, small UI code snippets. This repo is the source of truth for everything; [portfolio-site](https://github.com/MLDuke/portfolio-site)'s `/journal` section pulls in only the entries marked `publish: true`.

## Structure

```
entries/
  .gitkeep
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
description: "A motion pass at snap-aligned image browsing."
date: "2026-08-31"
slug: "scroll-snap-experiment"
type: image        # image | code | mixed
publish: false      # only true entries reach the portfolio site
media:
  - src: "scroll-snap.gif"
    alt: "Scroll snap prototype moving between image panels"
    caption: "A quick motion pass for snap-aligned image browsing."
sourcePath: "src/"  # only present for type: code | mixed
---
```

Media `src` values are paths relative to the entry folder. Keep images and GIFs
beside `index.md`; keep source files under `src/` and point `sourcePath` there.

New entries start with `media: []` — an empty list, not a blank stub, so an entry
you haven't filled in yet contributes no media rather than one empty item.
Filling it in means replacing the `[]` with the indented list shown above. `alt`
is required on any item that has a `src`; `caption` is optional.

`description` is 1–2 sentences written for someone who hasn't opened the entry.
`portfolio-site` uses it for the journal card and the page meta/OG tags, so it's
required once `publish: true` — it's deliberately authored here rather than
derived from the first line of the body.

No tags/categories for now — add them later if the collection grows enough to need filtering.

## Workflow

1. Build the sketch wherever's fastest (this doesn't need to happen in this repo).
2. `npm run new` — prompts for a title and type, creates the dated entry folder and frontmatter stub (plus `src/` if the type needs it).
3. Drop in media, and source under `src/` if applicable.
4. Fill in `index.md`.
5. When it's ready to share, flip `publish: true`, run `npm run validate`, and push to `main`.

`npm run validate` checks every entry. Drafts only need to be well-formed;
`publish: true` entries additionally have to have a `description`, real media —
at least one item for `image` and `mixed` types, each with an `alt` and a `src`
that exists on disk — and a non-empty `sourcePath` for `code` and `mixed` types.
The same check runs in CI ahead of the deploy hook, so a half-filled entry blocks
the rebuild rather than shipping a blank figure — or crashing `portfolio-site`'s
build, which throws on media that has a `src` but no `alt`.

Everything defaults to unpublished — most entries can just stay private-by-convention in this public repo. Publishing is a one-line, one-push action; nothing else needs to change in `portfolio-site` for it to show up (see `.github/workflows/deploy-portfolio.yml`, which needs a `VERCEL_DEPLOY_HOOK_URL` secret set once `portfolio-site` has one).

## What this repo does not do

- No syntax-highlighted code rendering — `portfolio-site` only ever links out to a file here. Source code in `src/` is never fetched or copied by the portfolio build.
- No video — GIFs cover motion for now; large binaries aren't worth the repo bloat yet.
