# Progress Log

> Claude updates this after every task. The **Resume point** is the first thing
> to read at the start of a session. Newest entries on top.

## Resume point
- **Next task:** `T1.1` — Monorepo + tooling + datastores (then `T1.2`, the foundation keystone).
- **Branch:** `chore/bootstrap`
- **Notes:** Start at T1.1. The cross-cutting foundation (MikroORM, BaseEntity with uuid v7 + timestamps + soft delete, EncryptedText/PII, Result pattern) is built in **T1.2, up front** — not deferred. If a Week-1 monorepo already exists, jump to T1.2 or the first unmet task.

## Log
<!-- Format:
### YYYY-MM-DD — <task id> <title>
- What changed (files/modules)
- Decisions made (also append to DECISIONS.md if notable)
- Tests added; lint/test status
- Follow-ups / TODOs discovered
- **Parking lot** (only if mid-task session end): what's done so far, exact next step within the task
-->

### 2026-06-29 — Project bootstrap

- Created Claude Code control files: CLAUDE.md, docs/CODING-STANDARDS.md,
  docs/DECISIONS.md, docs/TASKS.md, this file, .claude/ commands + skills,
  .mcp.json, .env.example, Artillery skeleton.
- No application code yet. Start at T1.1, or T2.1 if Week 1 already exists.
