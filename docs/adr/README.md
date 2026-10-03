# Architecture decision records

One file per decision that isn't obvious from the code: what forced it, what was
chosen, and what that now costs or forbids. They hold the *why*. Vocabulary is in
[`CONTEXT.md`](../../CONTEXT.md), and the day-to-day process is in the
[authoring guide](../authoring-sketches.md), whose *Machinery* section indexes
what must not be removed.

- Files are `NNNN-kebab-title.md`, numbered in the order they were decided, and
  dated by the commit that introduced the decision.
- Don't rewrite an accepted ADR when the decision changes. Add a new one, and set
  the old one's status to `Superseded by NNNN`. Fix typos and broken links in place.
- Format: `Status`, then Context, Decision, Consequences.

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-publish-flag-on-main.md) | Publishing is `publish: true` on main, and only the author flips it | Accepted |
| [0002](0002-three-vite-globs.md) | Three Vite globs: notes and media eager, sketches lazy, all literal | Accepted |
| [0003](0003-vite-fs-allow-repo-root.md) | Vite serves from the repo root (`server.fs.allow`) | Accepted |
| [0004](0004-build-time-overlay-defines.md) | Dev overlays are toggled by build-time `define` booleans | Accepted |
| [0005](0005-vercel-framework-null.md) | `vercel.json` sets `framework: null` | Accepted |
| [0006](0006-conductor-port-from-env.md) | `CONDUCTOR_PORT` drives the dev port; Conductor passes only `--host` | Accepted |
| [0007](0007-separate-tsconfigs.md) | Separate tsconfigs for browser, node and test code | Accepted |
| [0008](0008-new-entry-two-input-paths.md) | `new-entry.mjs` keeps both input paths | Accepted |
| [0009](0009-node-test-over-vitest.md) | `node:test` instead of Vitest | Accepted |
| [0010](0010-entry-module.md) | One Entry module, two adapters | Accepted |
| [0011](0011-invalid-entries-render-with-problems.md) | Invalid entries render in the playground with their problems shown | Accepted |
| [0012](0012-lowercase-media-extensions.md) | Media extensions are lowercase only | Accepted |
| [0013](0013-folder-name-equals-date-slug.md) | The folder name must equal `<date>-<slug>` | Accepted |
| [0014](0014-sketch-internals-stay-in-entry.md) | Sketch internals stay in the entry until a second sketch needs them | Accepted |
