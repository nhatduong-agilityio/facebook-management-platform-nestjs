# Decisions & Pinned Versions

Record every dependency version and notable choice here. Verify with
`pnpm view <pkg> version` before adding anything. Versions below were checked
on **2026-06-29**; use these as the floor and prefer the latest patch.

## Toolchain
| Tool | Version | Note |
|---|---|---|
| Node | 25.x | runtime |
| pnpm | 10.x | package manager + workspace |
| TypeScript | **~5.9.3** | Pinned to 5.9, NOT 6.0. TS 6.0 is brand-new (released ~Apr 2026); typescript-eslint 8 and some Nest tooling may lag. Revisit upgrading to 6.x once `typescript-eslint` ships full TS6 support. |
| @types/node | ^26.0.1 | matches Node 25/26 |

## Runtime dependencies (latest as of 2026-06-29)
| Package | Version | Purpose |
|---|---|---|
| @nestjs/core, @nestjs/common | ^11.1.27 | framework (engines: node >= 20, OK on 25) |
| @nestjs/platform-express | ^11.1.27 | HTTP adapter |
| @nestjs/config | ^4.0.4 | config |
| @nestjs/swagger | ^11.4.4 | OpenAPI |
| @nestjs/throttler | ^6.5.0 | rate limiting |
| @nestjs/microservices | ^11.1.27 | transport (if needed) |
| @mikro-orm/core | ^7.1.5 | ORM (Unit of Work) |
| @mikro-orm/postgresql | ^7.1.5 | PG driver |
| @mikro-orm/mongodb | ^7.1.5 | Audit Service driver |
| @mikro-orm/nestjs | ^7.0.2 | Nest integration |
| @mikro-orm/migrations | ^7.1.5 | migrations |
| @golevelup/nestjs-rabbitmq | ^9.0.2 | RabbitMQ event bus |
| @clerk/backend | ^3.8.4 | JWT verification at gateway |
| stripe | ^22.3.0 | billing |
| algoliasearch | ^5.55.1 | search (NOT the empty `algolia` pkg) |
| ioredis | ^5.11.1 | Redis cache |
| neverthrow | ^8.2.0 | Result pattern |
| uuidv7 | ^1.x | app-generated time-ordered ids (verify: `pnpm view uuidv7 version`) |
| nestjs-pino + pino | ^4.6.1 / ^10.3.1 | logging |
| pino-pretty | ^13.1.3 | dev log formatting |
| class-validator | ^0.15.1 | DTO validation |
| class-transformer | ^0.5.1 | DTO transform |
| helmet | ^8.2.0 | security headers |
| reflect-metadata | ^0.2.2 | decorators |
| rxjs | ^7.8.2 | Nest peer dep |

## Dev dependencies
| Package | Version | Purpose |
|---|---|---|
| @nestjs/cli | ^11.0.23 | scaffolding |
| @nestjs/testing | ^11.1.27 | test utils |
| vitest | ^4.1.9 | test runner (replaces Jest) |
| @vitest/coverage-v8 | ^4.1.9 | coverage |
| unplugin-swc + @swc/core | ^1.5.9 / ^1.15.43 | fast TS transform for Vitest/Nest |
| artillery | ^2.0.33 | API + load testing |
| tsx | ^4.22.4 | run TS scripts |
| eslint | **^9.x** | Pinned to 9, NOT 10. ESLint 10 is very new; `typescript-eslint@8` targets ESLint 9 flat config. Revisit when typescript-eslint confirms ESLint 10. Verify: `pnpm view typescript-eslint peerDependencies`. |
| typescript-eslint | ^8.62.0 | TS linting (flat config) |
| prettier | ^3.9.3 | formatting |

> Rationale for not blindly taking "latest" on TypeScript and ESLint: both had
> major releases (TS 6.0, ESLint 10) within ~weeks of this date. The linting
> stack (`typescript-eslint@8`) is built against TS 5.x + ESLint 9. Pinning the
> two majors one notch back avoids a broken lint pipeline while keeping
> everything else on the newest supported release. Upgrade deliberately, not by default.

## Architecture decisions (mirror of CR-01 ADRs)
- ADR-011 MikroORM (Unit of Work + Identity Map) over TypeORM
- ADR-012 PII encryption at rest (AES-256-GCM) + log/event redaction
- ADR-013 Application-generated UUID v7 keys for separate services
- ADR-014 Soft delete + created/updated/deleted timestamp triplet
- ADR-015 Result pattern for domain errors
- ADR-016 Audit Service on MongoDB (schemaless, event-sourced)
- ADR-017 Guarded billing state machine with transition log
- ADR-018 Index all foreign keys (real + logical)

## Additional dev tooling (added T1.1, verified 2026-06-30)
| Package | Version | Purpose |
|---|---|---|
| husky | ^9.1.7 | git hooks manager |
| lint-staged | ^17.0.8 | run linters on staged files |
| @eslint/js | ^9.39.4 | ESLint 9 base rules (pinned to 9.x — 10.x requires eslint 10) |
| globals | ^17.7.0 | browser/node globals for ESLint flat config |

> **ADR-020 `unplugin-swc` warning with vitest 4:** `unplugin-swc@1.5.9` internally
> sets `esbuild: false` in the Vite config. Vitest 4 replaced esbuild with oxc and
> prints a warning that `esbuild: false` is deprecated (oxc: false should be used).
> The SWC transform still works — tests pass and decorator metadata is supported.
> This is a cosmetic warning from `unplugin-swc` not yet updating for vitest 4.
> Revisit when a newer `unplugin-swc` is released.

## Change log
| Date | Decision |
|---|---|
| 2026-06-29 | Initial version pinning; TS held at 5.9, ESLint at 9 (see rationale). |
| 2026-06-29 | **Roadmap reorder (no effort change, ~222h):** moved MikroORM, BaseEntity (uuid v7 + timestamps + soft delete), PII `EncryptedText`, and the Result pattern from Week 5 into Week 1 (T1.2). These are foundational/cross-cutting — every feature inherits them, so building features first and "migrating" later would force a full rewrite of entities, repositories, and service signatures. Moved the Audit Service to Week 3 (after the event bus is stable, so audit can be exercised end-to-end). Week 5 is now verification + Artillery load testing, not building. This removes hidden rework and de-risks the schedule. |
| 2026-06-30 | **T1.1 complete.** pnpm workspace, NestJS 11 app, ESLint 9 flat config, vitest 4 + unplugin-swc, husky pre-commit (hooksPath set via `git rev-parse --show-prefix`), Docker Compose (PG 16, Mongo 7, Redis 7, RabbitMQ 3). Note ADR-020 above re vitest/swc cosmetic warning. |
| 2026-06-30 | **ADR-019 Performance optimization order — Index → Query → Cache.** Redis caching (response cache, RBAC cache, query cache) is Week 5-only and requires T5.5 Artillery benchmark data to justify. Most p99 regressions are solved by a missing index or an N+1 query; adding cache without that evidence buys invalidation complexity, stale-read risk, and extra monitoring for no proven gain. Consumer deduplication keys (`dedup:<eventId>`) are the only pre-T5 Redis use — they are idempotency infrastructure, not a performance cache. When cache is added in T5.6, record the before/after p99 and load level in this file. |
