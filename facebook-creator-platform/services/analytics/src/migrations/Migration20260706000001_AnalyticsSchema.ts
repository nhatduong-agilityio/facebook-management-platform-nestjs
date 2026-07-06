import { Migration } from '@mikro-orm/migrations';

/**
 * Creates the `analytics` schema and the `post_metrics` table.
 *
 * `post_id` and `workspace_id` are plain UUID columns (cross-schema logical FKs,
 * no DB FK constraint per BR-R06). Both have btree indexes (BR-R08, ADR-046).
 * Primary key is app-generated (no DB DEFAULT, ADR-013).
 */
export class Migration20260706000001_AnalyticsSchema extends Migration {
  async up(): Promise<void> {
    this.addSql(`CREATE SCHEMA IF NOT EXISTS analytics;`);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS analytics.post_metrics (
        id           UUID        NOT NULL,
        post_id      UUID        NOT NULL,
        workspace_id UUID        NOT NULL,
        metric_date  DATE        NOT NULL,
        reach        INTEGER     NOT NULL DEFAULT 0,
        impressions  INTEGER     NOT NULL DEFAULT 0,
        likes        INTEGER     NOT NULL DEFAULT 0,
        comments     INTEGER     NOT NULL DEFAULT 0,
        shares       INTEGER     NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_post_metrics PRIMARY KEY (id),
        CONSTRAINT uq_post_metrics_post_date UNIQUE (post_id, metric_date),
        CONSTRAINT chk_post_metrics_non_negative CHECK (
          reach >= 0 AND impressions >= 0 AND likes >= 0
          AND comments >= 0 AND shares >= 0
        )
      );
    `);

    this.addSql(`CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id
      ON analytics.post_metrics (post_id);`);

    this.addSql(`CREATE INDEX IF NOT EXISTS idx_post_metrics_workspace_id
      ON analytics.post_metrics (workspace_id);`);

    this.addSql(`CREATE INDEX IF NOT EXISTS idx_post_metrics_metric_date
      ON analytics.post_metrics (metric_date);`);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS analytics.post_metrics;`);
    this.addSql(`DROP SCHEMA IF EXISTS analytics;`);
  }
}
