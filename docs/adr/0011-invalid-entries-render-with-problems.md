# 0011. Invalid entries render in the playground with their problems shown

Status: Accepted · 2026-10-03

## Context
The playground used to build each entry with fallbacks of its own: a missing
title became the folder name, and an unknown `type` quietly became `image`. A
broken entry therefore looked fine until `npm run validate` said otherwise, and
the two views of the same entry disagreed. The alternative of hiding broken
entries would drop the draft you are editing from the one place you look at it.

## Decision
`readEntry` never throws and never guesses. Missing or invalid fields read as
`""`, `undefined` or `false`, and the problems list says why. The playground
renders every entry anyway and shows its problems on the index card and the entry
page. Where it needs a label, it falls back to the folder name for display only
(`titleOf` in `App.tsx`).

## Consequences
- Do not "tidy" those display fallbacks into defaults in the data. A defaulted
  field is a problem that no longer shows.
- The playground's list of problems is a subset. Its listing has no file sizes,
  no source text and only the files the globs matched, so it skips the checks
  that need sizes, source text or a complete listing. `validate` stays the gate.
