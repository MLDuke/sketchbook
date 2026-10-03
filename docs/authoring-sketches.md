# Authoring sketches

The long-form guide to adding an entry to this repo, and an index to the
machinery that renders it. Each fact lives in exactly one of these documents:

| Doc | Owns | Changes when |
| --- | --- | --- |
| [`README.md`](../README.md) | What the repo is, the **frontmatter schema**, and the publish pipeline into `portfolio-site` | The schema or the pipeline changes |
| [`AGENTS.md`](../AGENTS.md) | The rules in this guide, compressed to imperatives for coding agents | A rule agents must follow changes |
| **This guide** | The walkthrough, house style, and the index of machinery | A process or convention changes |
| [`CONTEXT.md`](../CONTEXT.md) | **Vocabulary**: what each domain term means | A term is introduced, renamed or redefined |
| [`docs/adr/`](adr/README.md) | **Decisions**: why the machinery is the way it is, one record per file | A decision is made, or an earlier one is replaced |

If two disagree, README wins on schema, this file wins on process, the ADRs win on
*why*, and `CONTEXT.md` wins on what a term means.

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
npm run validate && npm run typecheck && npm test
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
sketch genuinely hurts to read, not before — these are notebook pages. Moving
helpers *out* of the entry is a different matter: see
[ADR 0014](adr/0014-sketch-internals-stay-in-entry.md).

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

The rules themselves live in `scripts/lib/entry.mjs`
([ADR 0010](adr/0010-entry-module.md));
`scripts/validate-entries.mjs` only hands it each folder and prints what comes
back. They split into two tiers:

- **Structural — every entry, drafts included.** Required frontmatter fields,
  `type` enum, `YYYY-MM-DD` date, boolean `publish`, the folder name equalling
  `<date>-<slug>`, media weight and lowercase media extensions, and the sketch
  contract: if `src/index.*` exists it must contain a default export (one that
  only appears in a comment or a string doesn't count). These fail on drafts
  because they're broken *now* and cheap to fix now.
- **Content — `publish: true` only.** A real `description`, media that exists on
  disk with `alt` text, a `sourcePath` that isn't an empty directory, and an
  `src/index.*` that actually exists. Drafts are expected to be half-finished.

Each problem is an error or a warning, and only errors fail the run. The one
warning is media over 2 MB. The playground runs the same module over every
entry, so a broken entry still renders there but carries its problems on its
index card and its page, minus the checks that need file sizes, source text or a complete file listing.

`npm run typecheck` runs three projects: `playground/tsconfig.json`, which covers
`playground/src` **and** `../entries/*/src` — so sketches are typechecked under
`strict`, same as the app — `playground/tsconfig.node.json` for
`vite.config.ts`, and `playground/tsconfig.test.json` for `*.test.ts` files. Why
they're split is in [ADR 0007](adr/0007-separate-tsconfigs.md).

`npm test` runs Node's built-in test runner (`node:test`, no extra dependency;
[ADR 0009](adr/0009-node-test-over-vitest.md) has the reasoning and the Node
version it needs) over `scripts/**/*.test.mjs` and `entries/*/src/**/*.test.ts`.
A sketch that has logic worth pinning — layout maths, say — puts it in a sibling
module with no DOM in it and tests that, next to it in `src/`. Test sources must
be erasable-only TypeScript and import siblings with the `.ts` extension.

All three run in `.github/workflows/ci.yml` on every pull request.
`.github/workflows/deploy-portfolio.yml` runs `validate` again on push to `main`
before firing the deploy hook, so a broken published entry blocks the rebuild
instead of failing inside `portfolio-site`'s build.

## Publishing

Flipping `publish: true` and pushing to `main` is the whole publish action: CI
validates, the deploy hook fires, `portfolio-site` rebuilds and pulls the entry
into `/journal`. Nothing else has to change in either repo.

Why it's a flag on `main`, and why an agent never flips it, is in
[ADR 0001](adr/0001-publish-flag-on-main.md).

Sharing an *unpublished* sketch is a different thing: `npm run build:playground`
plus a Vercel preview gives you a URL, and you link to one sketch with the hash
route. But a plain deploy exposes **every** entry in the repo, drafts included,
so put Vercel Deployment Protection or Cloudflare Access in front of it first.

## Machinery

Load-bearing details in `playground/`, `scripts/` and the workflows. Each looks
removable and isn't. One line per decision record saying what to leave alone; the
reasoning, and what breaks otherwise, is in the ADR, so read it before changing
the thing.

- [0001](adr/0001-publish-flag-on-main.md) — the `validate` step ahead of the
  deploy hook, and the rule that only the author sets `publish: true`.
- [0002](adr/0002-three-vite-globs.md) — notes and media globs eager, sketch
  glob lazy, and all three literal.
- [0003](adr/0003-vite-fs-allow-repo-root.md) — `server.fs.allow: [repoRoot]`.
- [0004](adr/0004-build-time-overlay-defines.md) — the `define` booleans, never
  runtime env reads.
- [0005](adr/0005-vercel-framework-null.md) — `framework: null` in `vercel.json`.
- [0006](adr/0006-conductor-port-from-env.md) — `CONDUCTOR_PORT` in
  `vite.config.ts`, and no `--port` in the Conductor script.
- [0007](adr/0007-separate-tsconfigs.md) — three tsconfigs, and no `@types/node`
  in the browser project.
- [0008](adr/0008-new-entry-two-input-paths.md) — both the TTY prompts and the
  flags in `new-entry.mjs`.
- [0009](adr/0009-node-test-over-vitest.md) — `node:test`, no test dependency,
  Node 24 in the workflows.
- [0010](adr/0010-entry-module.md) — `entry.mjs` free of Node builtins, with all
  schema knowledge in it and none in the adapters.
- [0011](adr/0011-invalid-entries-render-with-problems.md) — no defaulting in the
  data; the playground shows problems.
- [0012](adr/0012-lowercase-media-extensions.md) — lowercase-only media
  extensions, in agreement with the literal glob.
- [0013](adr/0013-folder-name-equals-date-slug.md) — the folder-name check,
  drafts included.
