# sketchbook

Raw lab notebook for design and code explorations — static images, GIFs, small UI code snippets. This repo is the source of truth for everything; [portfolio-site](https://github.com/MLDuke/portfolio-site)'s `/journal` section pulls in only the entries marked `publish: true`.

Adding an entry: [`docs/authoring-sketches.md`](docs/authoring-sketches.md) is
the full guide — conventions, dependency policy, and the invariants behind
`playground/` and `scripts/`. [`AGENTS.md`](AGENTS.md) is the same rules
compressed for coding agents. This file stays the overview and owns the schema.

## Structure

```
entries/
  .gitkeep
  2026-08-31-scroll-snap-experiment/
    index.md         # frontmatter + a short note
    *.gif / *.png    # media, co-located with the entry
    src/             # present for type: code | mixed — the actual sketch source
      index.tsx      # default-exports a React component (the playground entry point)
playground/          # local Vite app that renders every entry — see "Playground"
docs/                # authoring guide
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
GIF for motion, PNG for stills, WebP where it wins — JPEG, AVIF and SVG also
render. `npm run validate` warns over 2 MB per file and fails over 5 MB.

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
2. `npm run new` — prompts for a title and type, creates the dated entry folder and frontmatter stub (plus `src/` if the type needs it). Pass `--title "…" --type image|code|mixed` to skip the prompts, which is also what makes it work in a non-interactive shell.
3. Drop in media, and source under `src/` if applicable.
4. Fill in `index.md`.
5. When it's ready to share, flip `publish: true`, run `npm run validate && npm run typecheck`, and push to `main`.

`npm run validate` checks every entry. Drafts only need to be well-formed;
`publish: true` entries additionally have to have a `description`, real media —
at least one item for `image` and `mixed` types, each with an `alt` and a `src`
that exists on disk — and a non-empty `sourcePath` for `code` and `mixed` types.
Some checks apply to drafts too, because they're broken regardless of publish
state: media weight, and the sketch contract — a `src/index.*` that exists must
have a default export. `npm run typecheck` covers `playground/src` and every
`entries/*/src` under `strict`.

Both run in CI on every pull request (`.github/workflows/ci.yml`), and `validate`
runs again ahead of the deploy hook, so a half-filled entry blocks the rebuild
rather than shipping a blank figure — or crashing `portfolio-site`'s build, which
throws on media that has a `src` but no `alt`.

Everything defaults to unpublished — most entries can just stay private-by-convention in this public repo. Publishing is a one-line, one-push action; nothing else needs to change in `portfolio-site` for it to show up (see `.github/workflows/deploy-portfolio.yml`, which needs a `VERCEL_DEPLOY_HOOK_URL` secret set once `portfolio-site` has one).

## Playground

`npm run dev` starts a local Vite app (`playground/`) that lists every entry in
one place: `code` and `mixed` entries render live, `image` entries show their
media. It's for previewing and iterating on a sketch — building elsewhere first
(step 1 above) is still fine; nothing here depends on the playground.

The entry contract for a live sketch is one file:

```tsx
// entries/<date>-<slug>/src/index.tsx
export default function Sketch() {
  return <div>…</div>;
}
```

A sketch without a default export fails `npm run validate`, draft or not.

Shared deps (`react`, `motion`, `dialkit`) are hoisted at the repo root, so a
sketch just imports them — no per-entry `package.json` or install. Each sketch is
a lazy chunk: the dev server only compiles the one you open, and startup stays
flat as the collection grows. Sketches can call `useDialKit` directly.

If a sketch genuinely needs its own dependency, add a `package.json` in its
folder and register it under `workspaces` in the root `package.json` — the
playground picks it up the same way.

### Dev overlays

The `dialkit` dial panel and the `agentation` annotation toolbar are mounted once
by the playground shell (`playground/src/devtools.tsx`). They're **on under
`npm run dev`** and **stripped from `npm run build:playground`** — package and
all — unless re-enabled per build:

| env var | effect |
| --- | --- |
| `ENABLE_DIALKIT=true` | ship the dial panel in the build |
| `ENABLE_AGENTATION=true` | ship the annotation toolbar in the build |

Set them independently as Vercel project env vars, or inline for a local build
(`ENABLE_AGENTATION=true npm run build:playground`). A gitignored repo-root
`.env` is also read — see `.env.example`.

Note: a sketch that imports `useDialKit` still bundles the dialkit *runtime* into
its own chunk regardless of the toggle — the toggle only controls the panel UI.
With the panel off, such a sketch just renders at its default dial values.

### Sharing a sketch with your team

`npm run build:playground` emits a static site to `playground/dist/` (gitignored).
`vercel.json` points a Vercel project at it (`buildCommand`/`outputDirectory`
preset), so pushing a branch gives a preview URL; link straight to one sketch
with the hash route, e.g. `https://<deploy>/#/2026-08-31-scroll-snap-experiment`.

This repo is public and most entries are unpublished drafts, and a plain deploy
exposes all of them. For team-only sharing, put access control in front —
Vercel Deployment Protection (password / Vercel Authentication) or Cloudflare
Access. Deploying the playground does not touch `portfolio-site`; the two are
independent.

## What this repo does not do

- No syntax-highlighted code rendering — `portfolio-site` only ever links out to a file here. Source code in `src/` is never fetched or copied by the portfolio build.
- No video — GIFs cover motion for now; large binaries aren't worth the repo bloat yet.
