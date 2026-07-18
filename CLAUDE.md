# CLAUDE.md — tenant dev workspace: c4e

You are working inside the **isolated dev workspace of the `c4e` tenant**.
This is NOT the Benkei engine. You can edit the tenant's catalog and memory;
the canonical framework (`benkei-orchestrator`) is deliberately absent.

## What you CAN edit
- `catalog/`  — the `@cryptobenkei/c4e` package source (adapters, services,
  jobs, dashboards `ui/*.tsx`). This is a **git worktree** on a `dev-session/*`
  branch; commits here ship on `ba-agent dev-ship c4e`. **This is the edit
  surface.**

## Read-only reference (do NOT edit)
- `memory/`  — a snapshot of the agent's FS wiki (`/benkei/storage`), for
  CONTEXT only. It is read-only on disk and excludes keys/locks. Foundation
  storage keeps sections as `index.html` + `index.meta.json` (with a
  `bodyHash`) under a **signed** event log, so hand-edits would break
  integrity. To change the tenant's knowledge, use the signed write path
  (the agent's Memory UI / `writeSection`), never these files.
- `core/`    — the **frozen** `@benkei-ai/core` (types reference). Never edit.

## What you must NOT do
- Do not try to reach or modify the Benkei engine (`benkei-orchestrator`,
  `server/foundation/*`). It is not mounted here — keep it that way.

## Build / ship
- Catalog builds standalone: `cd catalog && pnpm build` (tsup, against
  `@benkei-ai/core`).
- Ship = close this session, then `ba-agent dev-ship c4e` (build → commit →
  merge → deploy).
