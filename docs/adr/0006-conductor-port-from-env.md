# 0006. `CONDUCTOR_PORT` drives the dev port; Conductor passes only `--host`

Status: Accepted · 2026-09-09

## Context
Each local Conductor workspace needs a stable dev-server port that doesn't
collide with its siblings. Outside Conductor the variable is unset and Vite's
default of 5173 should apply. `playground/vite.config.ts` has derived the port
from the variable since the playground was added; the run script was settled
later, in the commit that pinned IPv4.

## Decision
`vite.config.ts` derives both `port` (falling back to 5173) and `strictPort`
(true only when the variable is set) from `CONDUCTOR_PORT`.
`.conductor/settings.toml` passes only `--host 127.0.0.1`, because Vite's
`localhost` default can resolve to `::1`.

## Consequences
- Do not add `--port` to the Conductor script. It overrides the config's fallback
  and fails with `option --port <port> value is missing` wherever the variable is
  unset, which breaks every non-Conductor checkout.
- `strictPort` makes a port clash fail loudly in Conductor instead of silently
  moving to another port.
