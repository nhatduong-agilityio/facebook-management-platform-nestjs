# Progress Log

> Claude updates this after every task. The **Resume point** is the first thing
> to read at the start of a session. Newest entries on top.

## Resume point
- **Next task:** `T1.3` — Identity module (Clerk JWT guard, `getOrCreateUser`, `GET /auth/me`, RBAC roles).
- **Branch:** `nestjs-practice`
- **Notes:** T1.2 is done — MikroORM v7 wired (PG + Mongo), BaseEntity, AppError/Result, EncryptedText, Pino with PII redaction, User entity + initial migration. Key v7 finding: decorators are in `@mikro-orm/decorators/legacy` (not core), type inference needs `TsMorphMetadataProvider` from `@mikro-orm/reflection`. Run `pnpm mikro-orm migration:up` once Docker is running to apply the initial migration.

## Log
<!-- Format:
### YYYY-MM-DD — <task id> <title>
- What changed (files/modules)
- Decisions made (also append to DECISIONS.md if notable)
- Tests added; lint/test status
- Follow-ups / TODOs discovered
- **Parking lot** (only if mid-task session end): what's done so far, exact next step within the task
-->

### 2026-06-30 — T1.2 Persistence + cross-cutting foundation

- **Common infrastructure created:**
  - `src/common/errors/app-error.ts` — AppError + AppErrorCode (9 codes)
  - `src/common/http/to-http-exception.ts` — maps AppError.code → HttpStatus
  - `src/common/crypto/aes-gcm.ts` — AES-256-GCM encrypt/decrypt (key from PII_ENCRYPTION_KEY)
  - `src/common/crypto/encrypted-text.type.ts` — MikroORM Type for PII columns
  - `src/common/entities/base.entity.ts` — uuid v7 id, timestamps, softDelete filter
- **MikroORM wired:**
  - `src/database/database.module.ts` — PostgreSQL (primary) + MongoDB (named context 'mongo')
  - `apps/api/mikro-orm.config.ts` — CLI config with TsMorphMetadataProvider
- **Sample entity + migration:**
  - `src/modules/identity/entities/user.entity.ts` — User entity in core.users
  - `src/migrations/Migration20260630000000_InitialSchema.ts` — creates core schema + core.users
- **Updated:** `src/app.module.ts` (DatabaseModule + LoggerModule/Pino PII redaction), `src/main.ts` (Pino logger)
- **Key MikroORM v7 findings (ADR-021/022/023):** decorators split to `@mikro-orm/decorators/legacy`; type inference needs `TsMorphMetadataProvider`; migration generation needs live DB for `--initial` but `schema:create --dump` works offline.
- **Boot-verification fixes:** removed `exports: [MikroOrmModule]` from DatabaseModule (dynamic module instances can't be re-exported by class reference — `@mikro-orm/nestjs` registers providers globally so export is unnecessary); added `discovery: { warnWhenNoEntities: false }` to MongoDB context so it defers entity validation until T3.x Audit Service entities exist.
- Tests: 30/30 passing. Lint: clean. App boots to `Application listening on port 3000` with all modules initialized.
- `pnpm mikro-orm migration:up` will apply the initial schema once Docker is running.

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
