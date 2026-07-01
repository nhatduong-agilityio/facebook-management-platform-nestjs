import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the workspace and workspace-membership tables to the `core` schema.
 *
 * Entities managed:
 * - `core.workspaces` — workspace records with soft-delete support.
 * - `core.workspace_members` — per-workspace role assignments (hard-delete on removal).
 *
 * Notable decisions:
 * - No `DEFAULT gen_random_uuid()` on primary keys — ids are app-generated (ADR-013).
 * - `owner_user_id` references `core.users` via a real same-schema FK (allowed; BR-R06
 *   only restricts *cross-schema* FKs). Indexed for owner-list queries (BR-R08).
 * - `workspace_members.(workspace_id, user_id)` is unique (BR-R01).
 * - All FK columns carry a btree index (BR-R08).
 */
export class Migration20260701000000_WorkspaceSchema extends Migration {
  /**
   * Creates `core.workspaces` and `core.workspace_members` with all constraints
   * and indexes required by the reference DDL (`docs/reference/fcp-ddl.sql`).
   */
  override async up(): Promise<void> {
    this.addSql(`
      create table "core"."workspaces" (
        "id"            uuid          not null,
        "created_at"    timestamptz   not null default now(),
        "updated_at"    timestamptz   not null default now(),
        "deleted_at"    timestamptz   null,
        "name"          varchar(100)  not null,
        "slug"          varchar(120)  not null,
        "description"   varchar(500)  null,
        "status"        varchar(15)   not null default 'active',
        "owner_user_id" uuid          not null references "core"."users" ("id") on delete restrict,
        constraint "pk_workspaces" primary key ("id"),
        constraint "uq_workspaces_slug" unique ("slug"),
        constraint "chk_workspaces_status" check ("status" in ('active', 'suspended')),
        constraint "chk_workspaces_name_len" check (char_length("name") >= 2)
      );
    `);

    this.addSql(`create index "idx_workspaces_owner_user_id" on "core"."workspaces" ("owner_user_id");`);

    this.addSql(`
      create table "core"."workspace_members" (
        "id"           uuid         not null,
        "workspace_id" uuid         not null references "core"."workspaces" ("id") on delete cascade,
        "user_id"      uuid         not null references "core"."users" ("id") on delete cascade,
        "role"         varchar(20)  not null default 'viewer',
        "invited_at"   timestamptz  null,
        "accepted_at"  timestamptz  null,
        "joined_at"    timestamptz  not null default now(),
        constraint "pk_workspace_members" primary key ("id"),
        constraint "uq_workspace_member" unique ("workspace_id", "user_id"),
        constraint "chk_workspace_members_role" check ("role" in ('owner', 'editor', 'viewer'))
      );
    `);

    this.addSql(`create index "idx_workspace_members_workspace_id" on "core"."workspace_members" ("workspace_id");`);
    this.addSql(`create index "idx_workspace_members_user_id" on "core"."workspace_members" ("user_id");`);
    this.addSql(`create index "idx_workspace_members_owner" on "core"."workspace_members" ("workspace_id") where "role" = 'owner';`);
  }

  /**
   * Drops `core.workspace_members` first (FK dependency), then `core.workspaces`.
   */
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "core"."workspace_members" cascade;`);
    this.addSql(`drop table if exists "core"."workspaces" cascade;`);
  }
}
