# 0001. Publishing is `publish: true` on main, and only the author flips it

Status: Accepted · 2026-08-31

## Context
This repo is the source of truth for every sketch, and it is public. Only some
entries belong on the portfolio site, and the rest are drafts that stay
private-by-convention.

## Decision
Publishing is a one-line frontmatter edit, `publish: true`, plus a push to
`main`. The push fires a deploy hook that rebuilds `portfolio-site`, which pulls
in the flagged entries. There is no separate release step or publish branch. The
author decides when to flip it. An agent never does, and `AGENTS.md` forbids it.
The pipeline itself is described in [README.md](../../README.md#workflow).

## Consequences
- Publishing is the only outward-facing action in the repo, and the one that is
  hard to take back. The flag is a one-line edit that could plausibly be made
  while tidying something else, which is why the rule is explicit rather than
  left to judgement.
- The deploy workflow runs `validate` before it fires the hook. Do not remove
  that step: it is what keeps a half-filled published entry from failing inside
  `portfolio-site`'s build.
- Deploying the playground is a separate matter and never publishes anything, but
  it exposes every draft. See the *Publishing* section of the
  [guide](../authoring-sketches.md#publishing).
