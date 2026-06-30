---
description: Load a task from docs/TASKS.md and begin it following our conventions
argument-hint: <task-id e.g. T2.1>
---

You are starting task **$1**.

1. Read `docs/PROGRESS.md` (resume point) and `docs/DECISIONS.md` (pinned versions).
2. Find task **$1** in `docs/TASKS.md`. Restate its scope, the business rules /
   endpoints it touches, and its Definition of Done in 3-5 bullets. If the task
   id doesn't exist or is ambiguous, stop and ask.
3. Re-read the relevant sections of `docs/CODING-STANDARDS.md` for the patterns
   this task needs (Result pattern, BaseEntity, EncryptedText, events, etc.).
4. Propose the implementation plan as a numbered list (files to add/change, tests
   to write). Then write **exactly this line and stop**:
   > Plan ready — reply "go" to begin coding.
   Do not write any code, create any file, or run any command until the user replies.
5. Implement only this task. Do not start adjacent tasks. Use pnpm, MikroORM,
   neverthrow, app-gen uuid v7, soft-delete timestamps, PII rules — per CLAUDE.md.
6. Verify package versions with `pnpm view <pkg> version` before adding any dep,
   and record it in `docs/DECISIONS.md`.

Mark the task `[~]` in TASKS.md when you begin.
