# 0008. `new-entry.mjs` keeps both input paths

Status: Accepted · 2026-09-17

## Context
The scaffold started as an interactive prompt. Agents and Conductor run scripts
execute in a non-interactive shell with no terminal, where a prompt hangs.

## Decision
`scripts/new-entry.mjs` accepts `--title` and `--type` flags and prompts for
whatever is missing, but only when `stdin` is a TTY. In a non-interactive shell
with a flag missing it exits with a clear error naming the missing flags.

## Consequences
- Keep both paths. Without the flags agents can't scaffold, which pushes them to
  hand-create entry folders. That is the drift the scaffold exists to prevent.
- Without the prompts, a person at a terminal has to remember the flags.
- `npm run new` stays out of `.conductor/settings.toml`. A Conductor run script is
  a fixed command with nowhere to type a title.
