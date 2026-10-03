# 0013. The folder name must equal `<date>-<slug>`

Status: Accepted · 2026-10-03

## Context
The folder name is the entry's identity in two places: it is the playground's
hash route (`#/2026-09-03-spring-grid`), and the date prefix is what makes the
repo browsable in date order on GitHub. Frontmatter carries `date` and `slug` as
well. Nothing tied the three together, so a renamed folder or an edited date left
them disagreeing.

## Decision
A structural check, `folder-name`, requires the folder to be named
`${date}-${slug}`. It applies to drafts too, because a folder that doesn't match
is broken now, and the route is shared before anything is published.

## Consequences
- Renaming a folder, or editing `date` or `slug`, means changing both. It also
  breaks any link you have shared, as the folder is the route.
- `npm run new` derives the folder, date and slug from one title, so scaffolded
  entries satisfy the check by construction.
- The rule is stated in the [README](../../README.md#frontmatter-schema).
