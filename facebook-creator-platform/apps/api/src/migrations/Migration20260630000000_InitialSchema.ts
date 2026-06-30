import { Migration } from '@mikro-orm/migrations';

/**
 * Initial schema migration — creates the `core` schema and the `core.users` table.
 *
 * Entities managed by this migration:
 * - `core.users` — platform user records synchronised from Clerk (see User entity).
 *
 * Run with: `pnpm mikro-orm migration:up` (requires a running PostgreSQL instance).
 */
export class Migration20260630000000_InitialSchema extends Migration {
  /**
   * Applies the migration: creates the `core` schema and `core.users` table with
   * all constraints, unique indexes, and the email btree index required by BR-R08.
   */
  override async up(): Promise<void> {
    this.addSql(`create schema if not exists "core";`);

    this.addSql(`
      create table "core"."users" (
        "id"            uuid         not null,
        "created_at"    timestamptz  not null default now(),
        "updated_at"    timestamptz  not null default now(),
        "deleted_at"    timestamptz  null,
        "clerk_user_id" varchar(255) not null,
        "email"         varchar(255) not null,
        "full_name"     varchar(100) null,
        "avatar_url"    varchar(2048) null,
        "status"        varchar(15)  not null default 'active',
        constraint "chk_users_status" check ("status" in ('active', 'inactive')),
        primary key ("id")
      );
    `);

    this.addSql(`alter table "core"."users" add constraint "users_clerk_user_id_unique" unique ("clerk_user_id");`);
    this.addSql(`alter table "core"."users" add constraint "users_email_unique" unique ("email");`);
    this.addSql(`create index "users_email_index" on "core"."users" ("email");`);
  }

  /**
   * Rolls back the migration: drops `core.users` and the `core` schema.
   * Cascades to remove all dependent objects.
   */
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "core"."users" cascade;`);
    this.addSql(`drop schema if exists "core" cascade;`);
  }
}
