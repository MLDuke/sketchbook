# 0010. One Entry module, two adapters

Status: Accepted · 2026-10-03

## Context
Knowledge of what an entry is (the schema, the rules, the frontmatter format) was
spread across `validate-entries.mjs`, `sketches.ts` and a shared
`scripts/lib/frontmatter.mjs`. The copies drifted: the playground defaulted
fields the validator rejected, and uppercase media extensions were weight-checked
but never rendered.

## Decision
`scripts/lib/entry.mjs` is the one place that knows what an entry is. It is plain
JavaScript with no Node builtins, takes pure data (folder name, `index.md` text,
a file listing with sizes, optionally the source text) and returns the parsed
entry plus a list of problems. Types live beside it in `entry.d.mts`. It
supersedes `frontmatter.mjs`, whose parser it absorbed along with a writer for the
scaffold. Two adapters gather inputs and hold no schema knowledge:
`scripts/validate-entries.mjs` (Node) and `playground/src/sketches.ts` (Vite
globs, with a partial listing). `new-entry.mjs` is a third caller, using the
writer.

## Consequences
- It can't touch `fs` or `path`, because it has to run unchanged in the browser.
- Keep `entry.d.mts` in sync by hand.
- The frontmatter parser is hand-rolled on purpose and handles only flat scalars
  and the one list of objects the schema needs. If the schema outgrows that, reach
  for a real YAML parser rather than extending the regexes.
- `entry.test.mjs` covers the module and checks its extension lists against the
  literal globs in `sketches.ts` ([0002](0002-three-vite-globs.md)).
