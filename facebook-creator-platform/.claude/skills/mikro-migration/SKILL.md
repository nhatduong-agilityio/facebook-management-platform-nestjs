---
name: mikro-migration
description: Use when creating or applying MikroORM migrations for the FCP Postgres schemas, so the generated SQL stays consistent with docs/reference/fcp-ddl.sql — per-schema ownership, app-generated uuid v7 keys (no DB default), full timestamp triplet, soft delete, cross-schema columns without FK constraints, and an index on every FK. Trigger on "migration", "schema change", "alter table", "migration:create/up".
---

# Skill: MikroORM migrations (FCP)

## When to use
Any schema change: new entity, new column, index, or constraint.

## Commands (pnpm)
```
pnpm mikro-orm migration:create     # generate from entity diff
pnpm mikro-orm migration:up         # apply
pnpm mikro-orm migration:down       # rollback last
pnpm mikro-orm schema:fresh --run   # dev only: rebuild from scratch
```

## Invariants to check on every generated migration
1. **Schemas**: tables land in the right schema (core / billing / analytics /
   notification / email / messaging). `search` owns no tables (Algolia, ADR-004).
   `audit` is **not** in Postgres — it's MongoDB.
2. **Ids**: `uuid` primary key with **no** `DEFAULT gen_random_uuid()` on
   service-owned tables (app-generated uuid v7, R3). core.* may keep a default
   only if explicitly decided.
3. **Timestamps**: every table has `created_at`, `updated_at`, `deleted_at`
   (timestamptz; deleted_at nullable). Messaging infra logs are the only
   append-only exception (no deleted_at).
4. **Cross-schema columns**: stored as plain `uuid` with **no** `REFERENCES`
   clause (BR-R06). Integrity is event-driven.
5. **Indexes**: every FK column — real and logical — has a btree index (R8),
   unless already covered by a UNIQUE constraint.
6. **Triggers / rules** that can't be CHECK constraints (scheduled_at future,
   sole-owner, one-way read status, same-workspace FB account) are applied via
   migration SQL, matching Phase 5 of the DB design.

## Process
1. Edit entities first; let MikroORM diff.
2. Run `migration:create`, then **read the generated SQL** and diff it mentally
   against `docs/reference/fcp-ddl.sql`. Fix the entity (not the SQL by hand)
   until they agree, unless the change is intentional and documented.
3. If you hand-edit migration SQL (e.g. to add a trigger), add a comment with
   the rule id (BR-xx) and note it in `docs/DECISIONS.md`.
4. Apply with `migration:up`; then run `docs/reference/verify-seed.sql` checks
   if seeding.
