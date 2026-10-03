# AGENTS.md

Lab notebook of design/code sketches. Each sketch is a folder under `entries/`;
a local Vite app (`playground/`) renders them all.

Rules first, then the path. Rationale lives in
[`docs/authoring-sketches.md`](docs/authoring-sketches.md); the frontmatter
schema lives in [`README.md`](README.md#frontmatter-schema). Don't restate
either here — link to them.

## Hard rules

- **Never set `publish: true`.** It's the only outward-facing action in the repo:
  a push to `main` fires a deploy hook that rebuilds the public portfolio site.
  Publishing is the author's call, always. Ask.
- **Never suggest or configure a public playground deploy without access
  control.** This repo is public and most entries are unpublished drafts; a
  plain deploy exposes every one of them.
- **Never hand-create an entry folder.** Run `npm run new` (see below) — drift
  in entry structure is exactly what it exists to prevent.
- **Never install a dependency on your own.** See *Dependencies*.
- **Run `npm run validate && npm run typecheck && npm test` before you commit.**
  All three run in CI on the pull request; there is no reason to find out there.

## Commands

| | |
|---|---|
| `npm run new -- --title "T" --type image\|code\|mixed` | scaffold an entry (works non-interactively) |
| `npm run validate` | entry structure, sketch contract, media weight |
| `npm run typecheck` | `playground/src` **and** every `entries/*/src` |
| `npm test` | `node:test` over `scripts/**/*.test.mjs` and `entries/*/src/**/*.test.ts` |
| `npm run dev` | playground at `localhost:5173` |
| `npm run build:playground` | static build to `playground/dist/` |

## Adding a sketch

1. `npm run new -- --title "Scroll snap experiment" --type code`
2. For `code`/`mixed`: write `src/index.tsx`. For `image`: drop media beside
   `index.md` and list it under `media:`.
3. Fill in `title`, `description` and the note body in `index.md`.
4. `npm run validate && npm run typecheck && npm test`.
5. Leave `publish: false`. Stop and hand it back.

## The sketch contract

`entries/<date>-<slug>/src/index.tsx`, and nothing else is looked for:

```tsx
export default function Sketch() {
  return <div>…</div>;
}
```

- **Default export or it doesn't render.** `validate` fails on a `src/index.*`
  without one, draft or not.
- **Self-contained styling.** Inline styles with literal values. Do not use the
  playground's CSS variables — a sketch has to survive being lifted out.
- **The stage is already styled.** It gives you a dark background, 32px padding,
  a border and `min-height: 240px`. Never set a page background or
  full-viewport sizing.
- **One file** until it genuinely hurts. Siblings in the same `src/` are fine.
- **`useDialKit`'s panel label must equal the entry title** — that's what keeps
  the dial panel legible with several sketches open. Dials are
  `[default, min, max, step]`.
- **Seed your randomness.** A sketch must render identically on reload; a
  different picture every refresh isn't reviewable or screenshot-stable.

## Dependencies

`react`, `motion` and `dialkit` are hoisted at the repo root — just import them.
Beyond that, **ask before installing**: adding to root deps changes every future
sketch's baseline, and a one-off belongs in a per-entry workspace instead.

## Issue tracker

Issues live in Linear (team `Mduke`, label `sketchbook`), not GitHub Issues —
use the Linear MCP tools. See
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## Machinery — read before touching

`playground/`, `scripts/`, `vercel.json` and `.github/workflows/` carry
invariants that aren't obvious from the code, and unwinding one breaks the whole
collection rather than a single sketch. Read
[`docs/authoring-sketches.md#machinery`](docs/authoring-sketches.md#machinery)
before editing any of them.
