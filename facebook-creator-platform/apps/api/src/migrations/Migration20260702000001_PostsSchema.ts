import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the `core.posts` table.
 *
 * Notable decisions:
 * - `id` has no `DEFAULT` — the application generates UUID v7 before persist (ADR-013).
 * - `status` CHECK includes all five states agreed in T2.5 design (`publishing` is the
 *   state set synchronously when `facebook_graph_post_id` is captured from the Graph API).
 * - `deleted_at` is added for soft-delete support (T2.4 DoD); the reference DDL omits it
 *   but the T5.2 audit pass will reconcile the DDL.
 * - `workspace_id` and `facebook_account_id` are real same-schema FKs (both in `core`); indexed (BR-R08).
 * - `created_by_user_id` is a logical FK to `core.users` (cross-module — BR-R06); indexed (BR-R08).
 * - Partial index on `scheduled_at WHERE status = 'scheduled'` matches the reference DDL pattern.
 */
export class Migration20260702000001_PostsSchema extends Migration {
  /** Creates `core.posts` with all constraints and indexes. */
  override async up(): Promise<void> {
    this.addSql(`
      create table "core"."posts" (
        "id"                       uuid          not null,
        "workspace_id"             uuid          not null references "core"."workspaces" ("id") on delete restrict,
        "facebook_account_id"      uuid          references "core"."facebook_accounts" ("id") on delete restrict,
        "created_by_user_id"       uuid          not null,
        "title"                    varchar(255),
        "content"                  text          not null,
        "media_url"                varchar(2048),
        "status"                   varchar(15)   not null default 'draft',
        "facebook_graph_post_id"   varchar(255),
        "scheduled_at"             timestamptz,
        "published_at"             timestamptz,
        "last_error"               text,
        "created_at"               timestamptz   not null default now(),
        "updated_at"               timestamptz   not null default now(),
        "deleted_at"               timestamptz,
        constraint "pk_posts" primary key ("id"),
        constraint "chk_posts_status" check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
        constraint "chk_posts_content_len" check (char_length(content) between 1 and 63206)
      );
    `);

    this.addSql(
      `create index "idx_posts_workspace_id" on "core"."posts" ("workspace_id");`,
    );
    this.addSql(
      `create index "idx_posts_facebook_account_id" on "core"."posts" ("facebook_account_id");`,
    );
    this.addSql(
      `create index "idx_posts_created_by_user_id" on "core"."posts" ("created_by_user_id");`,
    );
    this.addSql(
      `create index "idx_posts_status" on "core"."posts" ("status");`,
    );
    this.addSql(
      `create index "idx_posts_scheduled_at" on "core"."posts" ("scheduled_at") where status = 'scheduled';`,
    );
  }

  /** Drops `core.posts`. */
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "core"."posts" cascade;`);
  }
}
