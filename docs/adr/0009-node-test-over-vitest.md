# 0009. `node:test` instead of Vitest

Status: Accepted · 2026-10-03

## Context
The Dot raster sketch has layout maths worth pinning with tests, and the scripts
(later the Entry module, [0010](0010-entry-module.md)) want coverage too. A test runner is a
dependency, and this repo asks before adding one: root dependencies are the
baseline every future sketch inherits and every deploy ships.

## Decision
Use Node's built-in runner. `npm test` runs `node --test` over
`scripts/**/*.test.mjs` and `entries/*/src/**/*.test.ts`. No dependency is added.
Node runs `.ts` tests by stripping types, which needs 22.18 or later.
`engines.node` is `>=22.18`, and CI and the deploy workflow run Node 24.

## Consequences
- Test sources must be erasable-only TypeScript (no enums, namespaces or
  parameter properties) and import siblings with the `.ts` extension.
  `tsconfig.test.json` enforces the first ([0007](0007-separate-tsconfigs.md)).
- No DOM test environment, mocking library or snapshot tooling. Logic worth
  testing goes in a DOM-free sibling module, which keeps sketches thin.
- Node 22.18 is the floor because it is the first 22.x that strips types without
  a flag. Moving back to an older Node breaks `npm test`.
