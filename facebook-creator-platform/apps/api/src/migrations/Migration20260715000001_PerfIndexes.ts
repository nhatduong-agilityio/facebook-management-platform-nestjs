import { Migration } from '@mikro-orm/migrations';

/**
 * Adds two composite indexes identified during the T5.6 query optimisation pass.
 *
 * Index 1 — `idx_invitations_workspace_email_status`
 * Covers `WHERE workspace_id = ? AND email = ? AND status = 'pending'`
 * (the duplicate-invite guard in `WorkspaceService.inviteMember`). Previously
 * only `workspace_id` was indexed so Postgres had to filter email + status in
 * memory after the index scan.
 *
 * Index 2 — `idx_posts_ws_created_at` (partial, WHERE deleted_at IS NULL)
 * Covers the paginated list query:
 *   `WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?`
 * The three-column composite index lets Postgres do a single index scan in the
 * correct order without a sort step; the partial predicate (`deleted_at IS NULL`)
 * keeps the index small (soft-deleted posts are excluded). Replaces the single-
 * column `idx_posts_workspace_id` for list queries.
 */
export class Migration20260715000001_PerfIndexes extends Migration {
  /** Adds the two composite indexes. */
  override async up(): Promise<void> {
    this.addSql(`
      CREATE INDEX "idx_invitations_workspace_email_status"
        ON "core"."invitations" ("workspace_id", "email", "status");
    `);

    this.addSql(`
      CREATE INDEX "idx_posts_ws_created_at"
        ON "core"."posts" ("workspace_id", "created_at" DESC, "id" DESC)
        WHERE "deleted_at" IS NULL;
    `);
  }

  /** Drops the two composite indexes. */
  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "core"."idx_posts_ws_created_at";`);
    this.addSql(`DROP INDEX IF EXISTS "core"."idx_invitations_workspace_email_status";`);
  }
}
