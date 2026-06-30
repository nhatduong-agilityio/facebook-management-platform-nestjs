---
description: Run checks, update progress docs, and summarise the task for review
---

Finish the current task:

1. Run `pnpm lint` and `pnpm test`. If anything fails, fix it (do not weaken
   conventions to make a test pass). Re-run until green.
2. Confirm the task's Definition of Done in `docs/TASKS.md` is fully met. If any
   part is unmet, say so explicitly instead of marking it done.
3. Mark the task `[x]` in `docs/TASKS.md`.
4. Update `docs/PROGRESS.md`:
   - Move the **Resume point** to the next task.
   - Add a dated log entry: what changed, decisions made, tests added, follow-ups.
5. If you made any notable choice (a new dependency + version, a pattern, a
   tradeoff), append a one-line entry to `docs/DECISIONS.md`.
6. Produce a concise review summary: files changed, key decisions, how to verify,
   and anything that needs my attention. **Do not start the next task.**
