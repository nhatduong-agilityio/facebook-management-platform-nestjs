# Facebook Creator Platform — Claude Code Guide

> This file is read automatically at the start of every Claude Code session.
> Keep it short and imperative. Detailed rules live in `docs/` — link, don't inline.

## What this project is
A **NestJS modular monolith** (`apps/api`) for scheduling/publishing Facebook
content, plus event-driven supporting services. Architecture, DB design, API
spec and roadmap are the source of truth in `docs/reference/` (the CR-01 docx
deliverables) and the diagrams. When code and docs disagree, **stop and ask** —
do not silently diverge.

## Stack — use these, verify versions in `docs/DECISIONS.md`
- Runtime: **Node 25**, **pnpm 10** (workspace). Never use npm/yarn here.
- Framework: **NestJS 11**. ORM: **MikroORM 7** (Unit of Work + Identity Map) — **never TypeORM**.
- Data: **PostgreSQL 16** (per-service schemas), **MongoDB** (audit, schemaless), **Redis** (cache only), **RabbitMQ** (event bus).
- Auth: **Clerk** (JWT at gateway). Payments: **Stripe** (state machine).
- Search: **Algolia**. Errors: **neverthrow** (Result pattern). Tests: **Vitest** + **Artillery**.

## Non-negotiable conventions — full detail in `docs/CODING-STANDARDS.md`
1. Service/domain methods return `Result<T, AppError>` (neverthrow). **Never throw for expected/domain failures.** Throw only for truly exceptional cases.
2. Primary keys are **app-generated UUID v7** created before persistence. **No DB `DEFAULT` on service-owned tables.**
3. Every entity has `createdAt` / `updatedAt` / `deletedAt`. Deletes are **soft** (MikroORM soft-delete filter). Messaging infra logs are the only append-only exception.
4. **PII**: Facebook access tokens are AES-256-GCM encrypted at rest (`EncryptedText` type). **Never log** `email`, `fullName`, or any token. Strip PII from event payloads.
5. **Cross-schema references** are plain `uuid` columns with **no FK constraint** (BR-R06); integrity is enforced via domain events. **Every FK (real + logical) has a btree index** (R8).
6. **One `em.flush()` per request = one transaction.** Collect domain events, persist, flush, then publish **after** commit.
7. Audit trail is **not** a Postgres table — it lives in the **Audit Service (MongoDB)**, fed by events. Exposed read-only via `apps/api` (Owner role).

## Build order — foundation first
The conventions above are **Week 1 foundation**, not late polish. MikroORM (UoW),
`BaseEntity` (uuid v7 + timestamps + soft delete), `EncryptedText` (PII), and the
Result pattern are set up in task **T1.2 before any feature code**, because every
feature inherits them — building on a wrong foundation and rewriting later is waste.
The Audit Service is a Week 3 task (after the event bus). Week 5 is verification +
Artillery load testing, not building. Follow `docs/TASKS.md` order; don't defer a
foundational concern to "later".

## How to work — task discipline
- **First action every session:** read `docs/PROGRESS.md` to find the resume point, then open the current task in `docs/TASKS.md`.
- Work **one task at a time**, in order. Do not start the next task until the current one meets its Definition of Done.
- Use `/start-task <id>` to begin a task and `/finish-task` to close it. Do not improvise the ritual.
- Use `/status` to restate the current task state mid-session without losing context.
- For each task: write code → write/extend tests → `pnpm lint && pnpm test` → update `docs/PROGRESS.md` → **stop for review**.
- When you make a notable choice (a version, a pattern, a tradeoff), append a one-line ADR to `docs/DECISIONS.md`.
- Never invent or guess a package version — run `pnpm view <pkg> version` and pin it, then record it.
- Never paste large blocks of the DDL or design docs into code; reference `docs/reference/fcp-ddl.sql` and keep entities in sync with it.

## Commands
- Install: `pnpm install`
- Dev: `pnpm start:dev`  ·  Build: `pnpm build`
- Test: `pnpm test`  ·  Watch: `pnpm test:watch`  ·  Coverage: `pnpm test:cov`
- Lint: `pnpm lint`  ·  Format: `pnpm format`
- Migrations: `pnpm mikro-orm migration:create` / `migration:up`
- Load test: `pnpm artillery run test/load/<scenario>.yml`

## Custom slash commands (in `.claude/commands/`)
- `/start-task <id>` — load a task from TASKS.md and begin it the right way
- `/finish-task` — run checks, update PROGRESS.md, summarise for review
- `/new-module <name>` — scaffold a NestJS module following our conventions

## Guardrails
- Don't refactor or rename outside the current task's scope without asking.
- Don't add a dependency without recording it in DECISIONS.md and explaining why.
- Don't weaken the conventions above to make a test pass — fix the code.
- If code and `docs/reference/` docs disagree, **stop and ask** — do not silently diverge.
- Don't add Redis caching logic (response cache, query cache, RBAC cache) before T5.5 load-test results — see `docs/CODING-STANDARDS.md` §12. Consumer deduplication keys are the only pre-T5 Redis use.
