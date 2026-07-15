import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the `core.facebook_accounts` table.
 *
 * Each row represents a Facebook Page connected to a workspace.
 * The `access_token` column stores an AES-256-GCM ciphertext (BR-F11).
 *
 * Notable decisions:
 * - `id` has no `DEFAULT` — the application generates UUID v7 before persist (ADR-013).
 * - `page_id` is globally unique: one Page can only be connected to one workspace.
 * - `workspace_id` is a real same-schema FK (both tables are in `core`); indexed (BR-R08).
 * - No `deleted_at` on creation — matches the reference DDL. `deleted_at` was later
 *   added via `Migration20260703000000_FacebookAccountSoftDelete` (T2.7) to support
 *   deauth soft-delete; entity still does not extend `BaseEntity` (ADR-036 confirmed
 *   in T5.2). No `@Filter` is applied; repository queries filter `{ deletedAt: null }`
 *   explicitly (ADR-031).
 */
export class Migration20260702000000_FacebookAccountsSchema extends Migration {
  /** Creates `core.facebook_accounts` with all constraints and indexes. */
  override async up(): Promise<void> {
    this.addSql(`
      create table "core"."facebook_accounts" (
        "id"               uuid          not null,
        "workspace_id"     uuid          not null references "core"."workspaces" ("id") on delete restrict,
        "page_id"          varchar(255)  not null,
        "page_name"        varchar(255)  not null,
        "access_token"     text          not null,
        "token_expires_at" timestamptz,
        "connected_at"     timestamptz   not null default now(),
        "updated_at"       timestamptz   not null default now(),
        constraint "pk_facebook_accounts" primary key ("id"),
        constraint "uq_facebook_accounts_page_id" unique ("page_id")
      );
    `);

    this.addSql(
      `create index "idx_facebook_accounts_workspace_id" on "core"."facebook_accounts" ("workspace_id");`,
    );
  }

  /** Drops `core.facebook_accounts`. */
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "core"."facebook_accounts" cascade;`);
  }
}
