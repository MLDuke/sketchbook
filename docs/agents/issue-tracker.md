# Issue tracker: Linear

Issues and specs for this repo live in **Linear** (workspace `mduke`, team `Mduke`, issue keys `MDU-<n>`), not GitHub Issues. Use the Linear MCP tools (`mcp__linear__*`). Don't use `gh issue` — the old GitHub issues are closed and only kept for history.

One Linear workspace and team covers several repos, so **always scope to this repo with the `sketchbook` label** (in the `repo` label group) when you list issues, and always apply it when you create one.

## Conventions

- **Create an issue**: `save_issue` with `team: "Mduke"`, `title`, `description` (markdown, real newlines), `labels: ["sketchbook", ...]`, and `project` when one applies. Type labels: `Feature`, `Bug`, `Improvement`, `Chore`.
- **Read an issue**: `get_issue` with `id: "MDU-<n>"` and `includeRelations: true`, plus `list_comments` for the discussion.
- **List issues**: `list_issues` with `team: "Mduke"`, `label: "sketchbook"`, and `state` / `project` / `parentId` filters as needed.
- **Comment on an issue**: `save_comment` on the issue.
- **Apply / remove labels**: `save_issue` with `id` plus `addLabels` / `removeLabels`. Don't pass `labels` unless you mean to replace the whole set.
- **Close**: `save_issue` with `state: "Done"` (or `"Canceled"`), after a `save_comment` explaining the outcome.

## Labels and statuses

- `ready-for-agent`: fully specced, so you can pick it up unattended.
- `needs-human`: manual work like dashboards, secrets or decisions. Never attempt these; surface them to the user.
- Statuses: `Backlog` (idea, not yet specced), `Todo` (specced and ready), `In Progress` (a Conductor workspace or branch exists), `In Review` (PR open), `Done` (merged), `Canceled`, `Duplicate`.

## Branches and PRs

Each issue gets one Conductor workspace, one branch and one PR. Put the lowercase issue key in the branch name (`mdu-12-short-slug`, or the `gitBranchName` that `get_issue` returns). Also put `MDU-12` in the PR title or body. Linear's GitHub integration then links the PR and moves the issue to In Review when the PR opens and to Done when it merges. Don't set those two statuses by hand. When you start work, set the issue to `In Progress` yourself.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, read PRs with `gh pr view` / `gh pr diff`, and file any accepted request as a Linear issue (labelled `sketchbook`) that links the PR.

## When a skill says "publish to the issue tracker"

Create a Linear issue as described above.

## When a skill says "fetch the relevant ticket"

Run `get_issue` with the `MDU-<n>` key (and `includeRelations: true`), then `list_comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue, and its **child** issues are the tickets.

- **Map**: a Linear issue labelled `wayfinder:map` (plus `sketchbook`), holding the Notes / Decisions-so-far / Fog body. Put it in the relevant Linear project if there is one.
- **Child ticket**: a sub-issue of the map (`save_issue` with `parentId: "<map key>"`), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`) plus `sketchbook`. If a `wayfinder:*` label doesn't exist yet, create it with `save_issue_label` (workspace-level). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Linear's native **blocked-by** relation (`save_issue` with `blockedBy: ["MDU-<n>"]`). Read it back with `get_issue` and `includeRelations: true`. A ticket is unblocked when every blocker is `Done` or `Canceled`.
- **Frontier query**: `list_issues` with `parentId: "<map key>"` and an unstarted `state`, then drop any ticket that has an open blocker or an assignee. The first remaining ticket in map order wins.
- **Claim**: `save_issue` with `assignee: "me"` and `state: "In Progress"`. This is the session's first write.
- **Resolve**: `save_comment` with the answer, then `save_issue` with `state: "Done"`, then append a context pointer (gist + link) to the map's Decisions-so-far using `save_issue` with `patch`.
