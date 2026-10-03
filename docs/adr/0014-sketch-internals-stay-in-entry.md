# 0014. Sketch internals stay in the entry until a second sketch needs them

Status: Accepted · 2026-10-03

## Context
Dot raster split into `renderer.ts` (WebGL2), `layout.ts` (pure panel maths, with
tests) and `index.tsx`. These are general enough that a shared library might
look like the obvious next step. A sketch also has to survive being lifted out of
the playground, and the portfolio only ever links to a file here.

## Decision
Renderers, layout helpers and similar internals live in their entry's own `src/`.
Nothing is extracted to a shared library until a second sketch actually needs it.
Siblings in the same `src/` are fine, and a sketch's own `*.test.ts` sits next to
the logic it pins.

## Consequences
- An entry stays self-contained and copyable, the same reasoning as inline styles
  with literal values ([guide](../authoring-sketches.md#house-style)).
- Two sketches may carry similar code for a while. That is cheaper than a shared
  module whose API was designed for one caller.
- When a second sketch does need something, extract it then, and record the move
  in a new ADR.
