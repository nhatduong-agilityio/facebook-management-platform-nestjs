# Claude Code Setup — Facebook Creator Platform

This repo is pre-configured so **Claude Code (terminal)** implements the FCP
backend consistently, task by task. Here's what's here and how to drive it.

## What's in the box
```
CLAUDE.md                     # always-on context Claude reads each session
.mcp.json                     # shared MCP servers (Mongo, Postgres, GitHub, Context7)
.claude/
  settings.json               # permission allowlist + guardrails (committed)
  commands/                   # /start-task, /finish-task, /new-module
  skills/                     # nest-module, mikro-migration, artillery-scenario
docs/
  CODING-STANDARDS.md         # the patterns Claude must follow (with examples)
  DECISIONS.md                # pinned package versions + ADRs
  TASKS.md                    # the 5-week plan split into reviewable tasks
  PROGRESS.md                 # resume point + per-task log (Claude updates this)
  reference/                  # CR-01 design docs, DDL, diagrams (source of truth)
test/load/                    # Artillery smoke + load scenarios
.env.example                  # all required env vars
```

## One-time setup
1. **Install Claude Code** and open this folder:
   ```
   npm i -g @anthropic-ai/claude-code   # or the current install method
   cd fcp && claude
   ```
2. **Env**: `cp .env.example .env` and fill it in. The following vars are also
   consumed by the MCP servers — export them in your shell or via direnv:
   ```
   MONGODB_URI          # mongodb MCP  (already needed for the app)
   DATABASE_URL         # postgres MCP (already needed for the app)
   STRIPE_SECRET_KEY    # stripe MCP   (already needed for the app — use sk_test_...)
   GITHUB_MCP_PAT       # github MCP   (Personal Access Token, repo + read:org scope)
   # context7 needs no key
   ```
3. **MCP — enable servers in your local settings**: `.mcp.json` defines 5 servers
   but `enableAllProjectMcpServers` is `false`, so each developer opts in explicitly.
   Create or update `.claude/settings.local.json` (gitignored, never commit it):
   ```json
   {
     "enabledMcpjsonServers": ["mongodb", "postgres", "github", "context7", "stripe"]
   }
   ```
   | Server | Purpose | When useful |
   | --- | --- | --- |
   | `context7` | Live docs for NestJS, MikroORM, Clerk, Stripe, Algolia | Every session |
   | `postgres` | Query schemas, verify migrations, inspect data | T1.1 onward |
   | `mongodb` | Inspect audit events | T3.4 onward |
   | `stripe` | Explore test events, verify webhook payloads | T3.1 onward |
   | `github` | PR management, CI status | Throughout |

   Then run `claude mcp list` to confirm all five load. If a server needs
   authentication, run `/mcp` inside a Claude session.
   > **Note:** `.mcp.json` uses `${VAR_NAME}` for env substitution. Your IDE may
   > show "variable not found" warnings on those lines — they are false positives;
   > Claude Code resolves them from your shell environment, not VS Code variables.
4. **Verify permissions**: the first time Claude runs a command not on the
   allowlist it will ask; approve or tighten `.claude/settings.json`.

## Daily workflow
1. Start a session: `claude`. Claude auto-reads `CLAUDE.md`.
2. `/start-task T2.1` — Claude loads the task, restates the DoD, proposes a plan,
   waits for your OK.
3. Approve → Claude implements just that task (Result pattern, MikroORM, uuid v7,
   soft delete, PII rules — all enforced by the standards).
4. `/finish-task` — Claude runs `pnpm lint && pnpm test`, marks the task done,
   updates `PROGRESS.md` + `DECISIONS.md`, and summarises for review.
5. Review, commit (Claude asks before `git commit`/`push`), repeat.

## Why this setup works
- **Consistency**: CLAUDE.md + CODING-STANDARDS.md mean every task uses the same
  patterns; the skills encode the repetitive scaffolding.
- **Completeness**: TASKS.md has a DoD per task, so "done" is objective.
- **Task-by-task**: the slash commands enforce one-task-at-a-time with a
  review gate, and PROGRESS.md keeps continuity across sessions.
- **No drift**: DECISIONS.md pins versions; reference docs are the source of truth.

## Tips
- Keep `CLAUDE.md` short — it's re-read every turn. Detail goes in `docs/`.
- If Claude starts wandering, point it back: "re-read CLAUDE.md and the current
  task in TASKS.md." Or use `/clear` to reset context between unrelated tasks.
- Use `claude --resume` to continue a previous session.
- Add new repeated chores as skills; add new work as tasks (keep them ≤ ~1 day).
- Run a `/finish-task` before context gets large; long sessions degrade quality.

## Bootstrapping the actual app
There's no application code yet. Start with **T1.1** in `docs/TASKS.md`
(`/start-task T1.1`). If you already have the Week-1 monorepo, jump to the
resume point in `docs/PROGRESS.md` (T2.1, Facebook OAuth).
