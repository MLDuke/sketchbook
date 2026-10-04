# 0007. Separate tsconfigs for browser, node and test code

Status: Accepted · 2026-09-17

## Context
Sketches run in the browser, `vite.config.ts` runs in Node, and tests run under
Node. A single project can't be right for all three. Adding `@types/node` to the
one that covers sketches changes what typechecks as valid sketch code.

## Decision
Three projects, all run by `npm run typecheck`:
- `playground/tsconfig.json` is the browser project: `playground/src` plus every
  `entries/*/src`, with `types: ["vite/client"]` and no Node types. It excludes
  `*.test.ts`.
- `tsconfig.node.json` extends it for `vite.config.ts`, the one config file that
  runs in Node, and adds `@types/node`.
- `tsconfig.test.json` (added 2026-10-03 with [0009](0009-node-test-over-vitest.md))
  covers `*.test.ts`. Tests import `node:test`, so it also adds `@types/node`. It
  sets `erasableSyntaxOnly` because Node's type stripping can't run enums,
  namespaces or parameter properties.

## Consequences
- Folding them together makes sketches compile with Node's globals: `setTimeout`
  returns `NodeJS.Timeout` instead of a number, and `process` typechecks in code
  where Vite leaves it undefined at runtime.
- Whatever a test imports is typechecked in the test project without DOM types,
  which is a quiet check that the module under test is DOM-free.
- `@types/node` belongs to two of the three projects, never the browser one.
