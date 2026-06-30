# Progress Log

> Claude updates this after every task. The **Resume point** is the first thing
> to read at the start of a session. Newest entries on top.

## Resume point
- **Next task:** `T1.2` — Persistence + cross-cutting foundation (MikroORM, BaseEntity, EncryptedText, Result pattern, Pino).
- **Branch:** `nestjs-practice`
- **Notes:** T1.1 is done — monorepo, tooling, Docker Compose all green. T1.2 is the keystone: MikroORM wired to Postgres + Mongo, BaseEntity (uuid v7, timestamps, soft-delete filter), AppError/Result helpers, EncryptedText (AES-256-GCM), Pino logger with PII redaction.

## Log
<!-- Format:
### YYYY-MM-DD — <task id> <title>
- What changed (files/modules)
- Decisions made (also append to DECISIONS.md if notable)
- Tests added; lint/test status
- Follow-ups / TODOs discovered
- **Parking lot** (only if mid-task session end): what's done so far, exact next step within the task
-->

### 2026-06-30 — T1.1 Monorepo + tooling + datastores

- Created: `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `eslint.config.mjs` (ESLint 9 flat config), `.prettierrc`, `.prettierignore`, `docker-compose.yml`, `.husky/pre-commit`
- Created: `apps/api/` — `package.json` (@fcp/api), `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `vitest.config.ts`, `src/main.ts`, `src/app.module.ts`, `src/health/` (controller + module + spec)
- Decisions: `@eslint/js` pinned to `^9.39.4` (not 10, which requires ESLint 10); `husky` prepare script uses `git rev-parse --show-prefix` to set `core.hooksPath` because `.git` is one level above the project root; `pnpm.onlyBuiltDependencies` allows `@swc/core` native binary install; ADR-020 filed for vitest 4 + unplugin-swc cosmetic warning.
- Tests: 1 file / 1 test (health controller) — passing.
- Lint: clean, zero warnings.
- `docker compose up` verified by config (PG 16, Mongo 7, Redis 7-alpine, RabbitMQ 3-management).
- **`/health` endpoint:** `GET /api/v1/health` → `{ status: 'ok' }` — requires `pnpm start:dev` to verify live.

### 2026-06-29 — Project bootstrap

- Created Claude Code control files: CLAUDE.md, docs/CODING-STANDARDS.md,
  docs/DECISIONS.md, docs/TASKS.md, this file, .claude/ commands + skills,
  .mcp.json, .env.example, Artillery skeleton.
- No application code yet. Start at T1.1, or T2.1 if Week 1 already exists.
