# Context

The vocabulary of this repo. Each term is defined here and nowhere else; the
rules about it live in the doc linked beside it. Decisions are in
[`docs/adr/`](docs/adr/README.md), process in the
[authoring guide](docs/authoring-sketches.md), and the frontmatter schema in the
[README](README.md#frontmatter-schema).

## What gets written

**Entry**
One folder under `entries/`: an `index.md`, any media beside it, and, for `code`
and `mixed` types, a `src/`. Its folder name is also its route in the playground.
In code it is `Entry` (the type in `scripts/lib/entry.mjs`) and its folder name is
the `dir` field.
_Avoid_: "sketch", when you mean the whole folder.

**Sketch**
The runnable part of an entry: the React component that `src/index.*`
default-exports. The playground's `Sketch` type in `playground/src/sketches.ts` is
broader: an Entry plus its problems and a lazy loader for the component. Where it
matters, say "sketch component" for the first and "playground Sketch" for the
second.

**Note**
The Markdown body of `index.md`, after the frontmatter. It is the `note` field on
an Entry.
_Avoid_: description. That is a separate frontmatter field, 1-2 sentences written
for the portfolio card and meta tags.

**Media**
The image and GIF files that sit beside `index.md` and are listed under `media:`.
Source code is not media.

**Sketch contract**
The one requirement on a sketch: `src/index.*` must default-export a React
component. See [AGENTS.md](AGENTS.md#the-sketch-contract). README calls the same
thing the "entry contract"; sketch contract is the term the guide, AGENTS.md and
the code use.

**Scaffold**
`npm run new`, and the stub entry it creates. It is how every entry begins.

## Where it shows up

**Playground**
The local Vite app in `playground/` that renders every entry. `npm run
build:playground` makes a static copy of it for preview deploys. It is separate
from `portfolio-site`, which is a different repo.
_Avoid_: "the portfolio", which is `portfolio-site`.

**Stage**
The dark panel a sketch renders into: a styled background, padding, a border and a
minimum height. Names disagree here. The guide says "the stage" for that panel,
which is `.canvas` in `playground/src/styles.css`, while the `Stage` component
and `.stage` class in the playground are the whole entry page that contains it.

**Dial panel**
The `dialkit` panel that lists the dials a sketch declares with `useDialKit`. Its
label is the entry title. It is one of the two **dev overlays**, the other being
the `agentation` annotation toolbar. See
[ADR 0004](docs/adr/0004-build-time-overlay-defines.md).

## Publishing

**Draft** and **Published**
Published means `publish: true`, the only state `portfolio-site` picks up. Draft
is everything else, and what every entry starts as. See
[ADR 0001](docs/adr/0001-publish-flag-on-main.md).
_Avoid_: "private". The docs say "private-by-convention", but the repo is public
and drafts are visible in it. "Unpublished" is a fine synonym for draft.

## Checking

**Problem**
One finding about an entry: a level (`error` or `warning`), a `code`, a message
and the file it concerns. Only errors fail `npm run validate`; the one warning is
a media file over 2 MB.

**Structural check**
A check that runs on every entry, drafts included, because the fault is broken
now and cheap to fix now. See
[the guide](docs/authoring-sketches.md#what-gets-checked-and-where).

**Content check**
A check that runs only on `publish: true` entries, such as a real description or
media with alt text. Drafts are allowed to be half-finished.

## The code that knows all this

**Entry module**
`scripts/lib/entry.mjs`: the one place that knows what an entry is. It takes
plain data and returns an Entry and its problems. See
[ADR 0010](docs/adr/0010-entry-module.md).
_Avoid_: "the validator", which is `scripts/validate-entries.mjs`, an adapter of it.

**Adapter**
Code that gathers the Entry module's inputs from its own world and decides what to
do with the problems, holding no schema knowledge. There are two. The **Node
adapter** is `scripts/validate-entries.mjs`, which reads the filesystem and sets
the exit code. The **Vite adapter** is `playground/src/sketches.ts`, which builds
the same inputs from the Vite globs. Those two labels are descriptive; the code
only says "adapter". `scripts/new-entry.mjs` is a caller of the module, not an
adapter.
