# Authoring sketches

The long-form guide to adding an entry to this repo and to the machinery that
renders it. Three documents, and each fact lives in exactly one of them:

- [`README.md`](../README.md) — what the repo is, the **frontmatter schema**, and
  the publish pipeline into `portfolio-site`.
- [`AGENTS.md`](../AGENTS.md) — the same rules as here, compressed to imperatives,
  for coding agents.
- **This file** — the walkthrough, the reasoning behind each convention, and the
  invariants in `playground/` and `scripts/`.

If something here contradicts README, README wins on schema and this file wins
on process.

## Anatomy of an entry

```
entries/2026-09-03-spring-grid/
  index.md            # frontmatter + a short note
  spring-grid.gif     # media, co-located
  src/index.tsx       # code | mixed only — the sketch itself
```

The date prefix is not decoration: entries sort chronologically in GitHub's file
browser, which is how this repo is meant to be read when nobody has a dev server
running. The folder name is also the playground's route — `#/2026-09-03-spring-grid`
— so renaming a folder breaks any link you've shared.

`type` picks what the playground does with the entry: `code` and `mixed` render
live, `image` shows media. `mixed` means both, and the sketch wins the stage
while the media becomes supporting material.

## Walkthrough

**1. Build it wherever's fastest.** This genuinely doesn't have to start in this
repo. The playground is for iterating and for keeping the collection in one
place, not a gate you have to enter through.

**2. Scaffold.**

```sh
npm run new -- --title "Scroll snap experiment" --type code
```

The flags are optional from a terminal — it'll prompt — but they're what make
the scaffold usable from a non-interactive shell, which is where agents and
Conductor run scripts live. Use it rather than creating the folder by hand: it
derives the date, the slug and the folder name from one title, and writes
frontmatter whose comments explain each field at the point you need them.

**3. Write the sketch or drop the media.** See *House style* below.

**4. Fill in `index.md`.** The `description` is the one field worth care: it
feeds the journal card and the page meta/OG tags on `portfolio-site`, so it's
written for someone who hasn't opened the entry. It's deliberately authored
rather than derived from the first line of the note.

**5. Check it.**

```sh
npm run validate && npm run typecheck
```

**6. Leave it unpublished.** Everything defaults to `publish: false` and most
entries stay that way — private-by-convention in a public repo. See *Publishing*.

## House style

Conventions the code implies but doesn't enforce. The enforced ones are in
*What gets checked*.

**Self-contained styling.** Sketches use inline styles with literal values, not
the playground's CSS custom properties. The playground is a viewer, not a
framework: README's contract with `portfolio-site` is that it *links out to a
file here*, so a sketch that reads `var(--line)` breaks the moment someone opens
it anywhere else. The cost is that colors are eyeballed against the dark stage —
`entries/2026-09-03-spring-grid/src/index.tsx` carries a comment saying so.

**The stage is already styled.** `.canvas` in `playground/src/styles.css` gives
every sketch a dark panel background, 32px of padding, a border and
`min-height: 240px`. A sketch that sets its own page background or
`100vw`/`100vh` sizing fights that and looks wrong in the list view.

**One file.** `playground/src/sketches.ts` only globs `src/index.{jsx,tsx,js,ts}`,
but that file can import siblings in the same `src/` normally. Split when the
sketch genuinely hurts to read, not before — these are notebook pages.

**Dial panel labels match the entry title.** `useDialKit("Spring grid", …)` in an
entry titled *Spring grid*. With several sketches open, the label is the only
thing telling you which panel belongs to what.

**Seeded randomness.** `pseudoRandom(i + seed * 997)` rather than `Math.random()`.
A sketch that renders differently on every reload can't be reviewed, diffed by
screenshot, or discussed — "the third row" has to mean something.

## Dependencies

`react`, `motion` and `dialkit` are hoisted at the repo root, so a sketch just
imports them: no per-entry `package.json`, no install step. Beyond those:

| situation | what to do |
|---|---|
| Already a root dep | Import it. |
| Broadly useful to future sketches | Add to root deps, and say so in the PR. |
| One-off, heavy, or pinned against a root version | Per-entry `package.json`, registered under `workspaces` in the root one. |
| You're an agent | Ask first, in all three cases. |

Root deps are the baseline every future sketch inherits and every deploy ships,
which is why widening them deserves a deliberate human yes.

## Media

GIF for motion, PNG for stills, WebP where it wins — the playground's glob also
accepts JPEG, AVIF and SVG. Name files descriptively in lowercase-kebab
(`scroll-snap-panels.gif`, not `media-1.gif`); free-form names age better than
numbered ones when an entry grows a second image.

`npm run validate` warns over 2 MB per file and fails over 5 MB, checked against
what's on disk rather than what frontmatter lists — repo bloat happens when you
commit the file, not when you publish it. If sketches ever genuinely need to be
heavier than that, the answer is external hosting, not raising the ceiling.

`alt` is required on any media item with a `src`: `portfolio-site` throws at
build time without it, so `validate` catches it here where the error makes sense.

## What gets checked, and where

`scripts/validate-entries.mjs` splits its checks in two:

- **Structural — every entry, drafts included.** Required frontmatter fields,
  `type` enum, `YYYY-MM-DD` date, boolean `publish`, media weight, and the
  sketch contract: if `src/index.*` exists it must contain a default export.
  These fail on drafts because they're broken *now* and cheap to fix now.
- **Content — `publish: true` only.** A real `description`, media that exists on
  disk with `alt` text, a `sourcePath` that isn't an empty directory, and an
  `src/index.*` that actually exists. Drafts are expected to be half-finished.

`npm run typecheck` runs two projects: `playground/tsconfig.json`, which covers
`playground/src` **and** `../entries/*/src` — so sketches are typechecked under
`strict`, same as the app — and `playground/tsconfig.node.json` for
`vite.config.ts`. See *Machinery* for why they're split.

Both run in `.github/workflows/ci.yml` on every pull request.
`.github/workflows/deploy-portfolio.yml` runs `validate` again on push to `main`
before firing the deploy hook, so a broken published entry blocks the rebuild
instead of failing inside `portfolio-site`'s build.

## Publishing

Flipping `publish: true` and pushing to `main` is the whole publish action: CI
validates, the deploy hook fires, `portfolio-site` rebuilds and pulls the entry
into `/journal`. Nothing else has to change in either repo.

That makes it the one irreversible-ish action here, and the reason `AGENTS.md`
forbids an agent doing it unprompted — it's a one-line frontmatter edit that
could plausibly be made while tidying something else.

Sharing an *unpublished* sketch is a different thing: `npm run build:playground`
plus a Vercel preview gives you a URL, and you link to one sketch with the hash
route. But a plain deploy exposes **every** entry in the repo, drafts included,
so put Vercel Deployment Protection or Cloudflare Access in front of it first.

## Machinery

Load-bearing details in `playground/`, `scripts/` and the workflows. Each looks
removable and isn't.

**`playground/src/sketches.ts` — three globs, deliberately different.** Notes and
media are `eager: true` because the index needs every title and thumbnail up
front. Sketch modules are lazy, one chunk each, which is what keeps dev-server
startup flat as the collection grows. Making them eager would compile every
sketch on every start.

**`playground/vite.config.ts` — `server.fs.allow: [repoRoot]`.** The playground's
Vite root is `playground/`, but it reads `../entries` and `../scripts`. Remove
this and every sketch 403s in dev.

**`vite.config.ts` — `define` folds to literal booleans.** `__DIALKIT_ENABLED__`
and `__AGENTATION_ENABLED__` become `true`/`false` at build time so the ternaries
in `src/devtools.tsx` dead-code-eliminate, dropping the disabled overlay's
wrapper *and its package* from the bundle. Replacing them with runtime env reads
ships both packages to every viewer. Overlays are on under `npm run dev` and off
in builds unless `ENABLE_DIALKIT` / `ENABLE_AGENTATION` is set — see
[`.env.example`](../.env.example). A sketch importing `useDialKit` still bundles
the dialkit *runtime* either way; the toggle only controls the panel UI.

**`vite.config.ts` — `CONDUCTOR_PORT`.** Port and `strictPort` both derive from
it so each Conductor workspace gets a stable, non-colliding port, falling back to
5173 elsewhere. `.conductor/settings.toml` therefore passes only `--host
127.0.0.1` (pinning IPv4, since Vite's `localhost` can resolve to `::1`) — adding
`--port` on the command line would override the fallback and break every
non-Conductor checkout.

**Two tsconfigs, and `@types/node` belongs to only one.** `tsconfig.json` is the
browser project (`playground/src` plus every `entries/*/src`);
`tsconfig.node.json` extends it for the one file that runs in Node,
`vite.config.ts`. Folding them back together means sketches compile with Node's
globals: `setTimeout` starts returning `NodeJS.Timeout` instead of a number, and
`process` typechecks in code where Vite leaves it undefined at runtime.

**`scripts/lib/frontmatter.mjs` — plain JS, no Node builtins.** One parser shared
by the browser (playground), the validator and the scaffold. Its types live
beside it in `frontmatter.d.mts`; keep them in sync. It handles flat scalars and
the single list-of-objects the schema needs — if the schema outgrows that, reach
for a real YAML parser rather than extending the regexes.

**`scripts/new-entry.mjs` — both input paths matter.** Prompts from a TTY, flags
otherwise, and a clear error rather than a hung readline when a non-interactive
shell is missing one. `npm run new` stays out of `.conductor/settings.toml` for
that reason: Conductor run scripts are fixed commands with nowhere to type a
title.

**`vercel.json` — `framework: null`.** The repo root isn't a framework project;
the build command and output directory point at the playground explicitly.
