# Progress Log

> Claude updates this after every task. The **Resume point** is the first thing
> to read at the start of a session. Newest entries on top.

## Resume point
- **Next task:** `T1.5` — Workspace module members & invitations (invite flow, sole-owner guard BR-R02, events).
- **Branch:** `nestjs-practice`
- **Notes:** T1.4 done. 70 tests passing. Migration `Migration20260701000000_WorkspaceSchema` adds `core.workspaces` + `core.workspace_members`. Run `pnpm mikro-orm migration:up` once Docker is running to apply.

## Log

### 2026-07-01 — T1.4 Workspace module core

- **Created:**
  - `src/modules/workspace/entities/workspace.entity.ts` — `Workspace extends BaseEntity`; fields: `name`, `slug`, `description`, `status`, `ownerUserId` (indexed); `@Entity({ tableName: 'workspaces', schema: 'core' })`
  - `src/modules/workspace/entities/workspace-member.entity.ts` — `WorkspaceMember` (no BaseEntity — DDL has no `deletedAt`); own uuid v7 PK; fields: `workspaceId`, `userId`, `role`, `invitedAt`, `acceptedAt`, `joinedAt`; `@Unique` on `(workspaceId, userId)` (BR-R01); btree indexes on both FK columns (BR-R08)
  - `src/modules/workspace/ports/workspace.repository.port.ts` — `IWorkspaceRepository`
  - `src/modules/workspace/ports/workspace-member.repository.port.ts` — `IWorkspaceMemberWriteRepository` (write-side port for seeding owner on create)
  - `src/modules/workspace/repositories/mikro-orm-workspace.repository.ts` — `MikroOrmWorkspaceRepository`; `findAllByUserId` uses raw SQL join (workspace_members cross-aggregate, no ORM relation — BR-R06)
  - `src/modules/workspace/repositories/mikro-orm-workspace-member.repository.ts` — `MikroOrmWorkspaceMemberRepository` (persist only, no flush)
  - `src/modules/workspace/dto/workspace.dto.ts` — `CreateWorkspaceDto` + `WorkspaceResponseDto` with Swagger
  - `src/modules/workspace/workspace.service.ts` — `WorkspaceService.create/listForUser/getById`; all return `Result<T, AppError>`; `create` generates slug, checks CONFLICT, persists workspace + owner membership in one flush
  - `src/modules/workspace/workspace.service.spec.ts` — 10 unit tests (ok + err paths)
  - `src/modules/workspace/workspace.controller.ts` — `WorkspaceController`; `POST /workspaces`, `GET /workspaces`, `GET /workspaces/:id`; maps Result → HTTP
  - `src/modules/workspace/workspace.module.ts` — imports `IdentityModule` (for `ClerkAuthGuard`); registers entities + port bindings
  - `src/migrations/Migration20260701000000_WorkspaceSchema.ts` — creates `core.workspaces` + `core.workspace_members` with all constraints and indexes; no DB-generated UUIDs
- **Updated:**
  - `src/app.module.ts` — added `WorkspaceModule`
  - `src/modules/identity/repositories/mikro-orm-workspace-member.repository.ts` — removed incorrect `deleted_at IS NULL` filter (`workspace_members` has no `deletedAt` per DDL)
- Tests: 70/70 passing. Lint: clean.
- **Setup required:** `pnpm mikro-orm migration:up` to apply `Migration20260701000000_WorkspaceSchema`.

### 2026-07-01 — Post-T1.3 enhancements (no task id — out-of-band)

- **Hexagonal Architecture refactor of IdentityModule:**
  - Created ports: `src/modules/identity/ports/user.repository.port.ts` (`IUserRepository`), `workspace-member.repository.port.ts` (`IWorkspaceMemberRepository`), `identity-provider.port.ts` (`IIdentityProvider`)
  - Created adapters: `repositories/mikro-orm-user.repository.ts`, `repositories/mikro-orm-workspace-member.repository.ts`, `repositories/clerk-identity-provider.ts`
  - Rewrote `identity.service.ts` — zero ORM / SDK / ConfigService imports; depends only on ports
  - Updated `docs/CODING-STANDARDS.md §13` with Ports & Adapters rules: services never import ORM types, SDKs, or ConfigService; no `vi.mock('@clerk/backend')` in service specs
- **BaseEntity / User — MikroORM v7 `Opt` fix:** `createdAt`, `updatedAt` (`BaseEntity`), `status` (`User`) typed as `T & Opt` so `em.create()` does not require caller to supply properties that have in-class defaults
- **DevAuthModule** (`NODE_ENV !== 'production'` only):
  - `POST /api/v1/dev-auth/token` — accepts `{ userId?, email?, template? }`, calls Clerk Backend API with `CLERK_SECRET_KEY`, returns a real Clerk JWT ready to paste into Postman's Authorization header
  - Falls back to a sign-in token URL if no active session exists for the user
- **Clerk webhook receiver:**
  - `POST /api/v1/webhooks/clerk` — receives `user.created`, `user.updated`, `user.deleted` events from Clerk
  - Signature verification via `verifyWebhook` from `@clerk/backend/webhooks` (no separate `svix` dep — it is bundled inside `@clerk/backend`)
  - `rawBody: true` added to `NestFactory.create` so the unmodified buffer is available for HMAC verification
  - `user.created` / `user.updated` → upsert email, name, avatar in `core.users`; `user.deleted` → soft-delete (idempotent)
  - ADR-026 filed in DECISIONS.md
- **Deleted:** `dev-auth.guard.ts` + spec (Bearer `dev:<userId>` bypass — rejected in favour of real Clerk JWTs)
- Tests: 60/60 passing. Lint: clean.
- **Setup required:** add `CLERK_WEBHOOK_SIGNING_SECRET=whsec_...` to `.env`; register `POST /api/v1/webhooks/clerk` in Clerk Dashboard → Webhooks, subscribe to `user.created`, `user.updated`, `user.deleted`.

### 2026-07-01 — T1.3 Identity module

- **Created:**
  - `src/modules/identity/types/workspace-role.type.ts` — `WorkspaceRole` type + `ROLE_HIERARCHY` map (`owner=3 > editor=2 > viewer=1`)
  - `src/modules/identity/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator
  - `src/modules/identity/decorators/roles.decorator.ts` — `@Roles()` metadata decorator + `ROLES_KEY`
  - `src/modules/identity/dto/auth-me-response.dto.ts` — `AuthMeResponseDto` with Swagger
  - `src/modules/identity/guards/clerk-auth.guard.ts` — `ClerkAuthGuard` (JWT verify via `verifyToken`, user upsert, 401 on failure/inactive)
  - `src/modules/identity/guards/roles.guard.ts` — `WorkspaceRolesGuard` (reads `@Roles` metadata, queries `core.workspace_members`)
  - `src/modules/identity/identity.service.ts` — `getOrCreateUser` (DB-first, Clerk API on first sign-in) + `getUserWorkspaceRole`
  - `src/modules/identity/identity.controller.ts` — `GET /auth/me`
  - `src/modules/identity/identity.module.ts` — exports guards + service
- **Updated:** `src/app.module.ts` (added `IdentityModule`), `apps/api/package.json` (added `@clerk/backend@^3.9.0`)
- **ADR-024:** Clerk JWT guard strategy: `verifyToken` (local crypto, no API call) + Clerk `users.getUser` only on first sign-in. See DECISIONS.md.
- Tests: 50/50 passing. Lint: clean.
- `WorkspaceRolesGuard.getUserWorkspaceRole` queries `core.workspace_members` which is created in T1.4; the guard is unit-tested with mocks and will work at runtime after T1.4's migration.

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
