import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the `core.invitations` table.
 *
 * Invitations track pending, accepted, expired, and revoked workspace invites.
 * No `deleted_at` or `updated_at` — records are immutable after creation; status
 * transitions are the only mutation. No app-generated uuid DEFAULT (ADR-013).
 *
 * Notable decisions:
 * - `role` is `editor | viewer` only — `owner` is forbidden (BR-F03b).
 * - `token` is 64-char hex (32 random bytes), unique, single-use.
 * - `invited_by_user_id` is a real same-schema FK (core→core; allowed by BR-R06).
 *   Indexed for audit queries (BR-R08).
 */
export class Migration20260701000001_InvitationsSchema extends Migration {
  /**
   * Creates `core.invitations` with all constraints and indexes.
   */
  override async up(): Promise<void> {
    this.addSql(`
      create table "core"."invitations" (
        "id"                  uuid          not null,
        "workspace_id"        uuid          not null references "core"."workspaces" ("id") on delete cascade,
        "email"               varchar(255)  not null,
        "role"                varchar(20)   not null,
        "token"               varchar(64)   not null,
        "status"              varchar(15)   not null default 'pending',
        "invited_by_user_id"  uuid          not null references "core"."users" ("id") on delete restrict,
        "expires_at"          timestamptz   not null,
        "created_at"          timestamptz   not null default now(),
        constraint "pk_invitations" primary key ("id"),
        constraint "uq_invitations_token" unique ("token"),
        constraint "chk_invitations_role" check ("role" in ('editor', 'viewer')),
        constraint "chk_invitations_status" check ("status" in ('pending', 'accepted', 'expired', 'revoked'))
      );
    `);

    this.addSql(`create index "idx_invitations_workspace_id" on "core"."invitations" ("workspace_id");`);
    this.addSql(`create index "idx_invitations_invited_by_user_id" on "core"."invitations" ("invited_by_user_id");`);
  }

  /** Drops `core.invitations`. */
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "core"."invitations" cascade;`);
  }
}
