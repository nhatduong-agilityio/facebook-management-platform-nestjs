import { Migration } from '@mikro-orm/migrations';

/**
 * Adds two partial indexes identified during the M-11 query review.
 *
 * Index 1 — `idx_posts_workspace_active`
 * Covers `COUNT(*) WHERE workspace_id = ? AND deleted_at IS NULL`, issued by
 * `MikroOrmPostRepository.countByWorkspace` on every `POST /posts` request for
 * the plan-quota check. Without a partial index Postgres scans all rows for the
 * workspace (including soft-deleted ones) before filtering.
 *
 * Index 2 — `idx_posts_scheduled_due`
 * Covers `WHERE status = 'scheduled' AND scheduled_at <= now() AND deleted_at IS NULL`,
 * issued by `PublishJob` every minute. The composite `(status, scheduled_at)` lets
 * Postgres use an index range scan on `scheduled_at` after the equality filter on
 * `status`. The partial predicate `WHERE status = 'scheduled' AND deleted_at IS NULL`
 * keeps the index small — only rows that can ever match the cron query are indexed.
 */
export class Migration20260717000001_PerfIndexesV2 extends Migration {
  /** Adds both partial indexes. */
  override async up(): Promise<void> {
    this.addSql(`
      CREATE INDEX "idx_posts_workspace_active"
        ON "core"."posts" ("workspace_id")
        WHERE "deleted_at" IS NULL;
    `);

    this.addSql(`
      CREATE INDEX "idx_posts_scheduled_due"
        ON "core"."posts" ("status", "scheduled_at")
        WHERE "status" = 'scheduled' AND "deleted_at" IS NULL;
    `);
  }

  /** Drops both partial indexes. */
  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "core"."idx_posts_scheduled_due";`);
    this.addSql(`DROP INDEX IF EXISTS "core"."idx_posts_workspace_active";`);
  }
}
