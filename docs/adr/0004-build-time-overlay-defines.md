# 0004. Dev overlays are toggled by build-time `define` booleans

Status: Accepted · 2026-09-03

## Context
The `dialkit` dial panel and the `agentation` annotation toolbar are dev tools.
They should be on under `npm run dev`, absent from a deployed build by default,
and individually switchable for a build that wants them.

## Decision
`playground/vite.config.ts` folds `__DIALKIT_ENABLED__` and
`__AGENTATION_ENABLED__` to literal `true` or `false` through `define`. The
ternaries in `playground/src/devtools.tsx` then dead-code-eliminate, so a disabled
overlay's wrapper module and its package are dropped from the bundle. A build
turns one on with `ENABLE_DIALKIT` or `ENABLE_AGENTATION`
([`.env.example`](../../.env.example), [README](../../README.md#dev-overlays)).

## Consequences
- Do not replace the `define`s with runtime env reads. That ships both packages
  to every viewer, enabled or not.
- A sketch that imports `useDialKit` still bundles the dialkit *runtime* either
  way. The toggle only controls the panel UI, and with it off the sketch renders
  at its default dial values.
