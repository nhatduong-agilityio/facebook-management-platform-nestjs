---
description: Scaffold a NestJS module following our conventions
argument-hint: <module-name e.g. posts>
---

Scaffold a new NestJS module named **$1** under `apps/api/src/modules/$1/`,
following `.claude/skills/nest-module/SKILL.md` and `docs/CODING-STANDARDS.md`.

Create:
- `$1.module.ts` — wires controller + service + MikroORM entities for this module.
- `$1.controller.ts` — endpoints map `Result` → HTTP via the shared mapper; Swagger decorators.
- `$1.service.ts` — methods return `Result<T, AppError>`; never throw for domain errors.
- `entities/` — entities extend `BaseEntity` (uuid v7, timestamps, soft delete);
  same-schema relations only; cross-schema refs are indexed uuid columns.
- `dto/` — class-validator DTOs.
- `events/` — domain events for anything that mutates state.
- `$1.service.spec.ts` — at least one ok-path and one err-path test.

Do not register a DB default for ids. Do not add PII to logs or events. After
scaffolding, run `pnpm lint && pnpm test` and report what you created.
