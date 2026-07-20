import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';

/** How long (in days) soft-deleted rows are retained before hard deletion. */
const RETENTION_DAYS = 90;

/**
 * Maximum rows deleted per batch iteration.
 *
 * Keeps individual transactions small to avoid long table locks and replication lag.
 * Each table is processed in a loop until no rows remain.
 */
const BATCH_SIZE = 500;

/**
 * Daily cron job that hard-deletes workspace rows (and their dependents) that have
 * been soft-deleted for more than 90 days (W-1, ADR-105).
 *
 * **Deletion order** (FK `ON DELETE RESTRICT` constraints require this sequence):
 * 1. `core.posts` — FK references `workspaces` AND `facebook_accounts`.
 * 2. `core.facebook_accounts` — FK references `workspaces`.
 * 3. `core.workspace_members` — FK references `workspaces`.
 * 4. `core.invitations` — FK references `workspaces`.
 * 5. `core.workspaces` — the root row.
 *
 * Each step targets rows whose parent workspace crossed the 90-day retention
 * threshold (`workspaces.deleted_at <= now() - interval '90 days'`). Raw SQL is
 * used exclusively so the MikroORM soft-delete filter does not hide already-deleted
 * rows. A forked `EntityManager` is used per ADR-030/054 — no cross-request pollution.
 *
 * **Batching (Fix 3)**: each table is deleted in chunks of `BATCH_SIZE` rows using
 * a `WHERE id IN (SELECT id ... LIMIT N)` subquery. This prevents single-transaction
 * lock contention on large tables. The loop exits when the affected row count is zero.
 */
@Injectable()
export class WorkspacePurgeJob {
  constructor(
    private readonly orm: MikroORM,
    private readonly logger: Logger,
  ) {}

  /**
   * Runs daily at 02:00 UTC and hard-deletes workspace rows older than 90 days.
   *
   * The job is idempotent: re-running it (e.g., after a crash) simply finds no
   * matching rows and exits immediately.
   */
  @Cron('0 2 * * *')
  async run(): Promise<void> {
    const em = this.orm.em.fork();
    const conn = em.getConnection();

    const cutoff = `now() - interval '${RETENTION_DAYS} days'`;

    try {
      // 1. Hard-delete posts in batches (FK: posts → workspaces AND facebook_accounts).
      const posts = await this.batchDelete(conn, `
        DELETE FROM core.posts
        WHERE id IN (
          SELECT p.id FROM core.posts p
          JOIN core.workspaces w ON p.workspace_id = w.id
          WHERE w.deleted_at IS NOT NULL
            AND w.deleted_at <= ${cutoff}
          LIMIT ${BATCH_SIZE}
        )
      `);

      // 2. Hard-delete facebook_accounts in batches (FK: accounts → workspaces).
      const accounts = await this.batchDelete(conn, `
        DELETE FROM core.facebook_accounts
        WHERE id IN (
          SELECT fa.id FROM core.facebook_accounts fa
          JOIN core.workspaces w ON fa.workspace_id = w.id
          WHERE w.deleted_at IS NOT NULL
            AND w.deleted_at <= ${cutoff}
          LIMIT ${BATCH_SIZE}
        )
      `);

      // 3. Hard-delete workspace_members in batches.
      const members = await this.batchDelete(conn, `
        DELETE FROM core.workspace_members
        WHERE id IN (
          SELECT wm.id FROM core.workspace_members wm
          JOIN core.workspaces w ON wm.workspace_id = w.id
          WHERE w.deleted_at IS NOT NULL
            AND w.deleted_at <= ${cutoff}
          LIMIT ${BATCH_SIZE}
        )
      `);

      // 4. Hard-delete invitations in batches.
      const invitations = await this.batchDelete(conn, `
        DELETE FROM core.invitations
        WHERE id IN (
          SELECT i.id FROM core.invitations i
          JOIN core.workspaces w ON i.workspace_id = w.id
          WHERE w.deleted_at IS NOT NULL
            AND w.deleted_at <= ${cutoff}
          LIMIT ${BATCH_SIZE}
        )
      `);

      // 5. Hard-delete workspaces in batches (all children already removed above).
      const workspaces = await this.batchDelete(conn, `
        DELETE FROM core.workspaces
        WHERE id IN (
          SELECT id FROM core.workspaces
          WHERE deleted_at IS NOT NULL
            AND deleted_at <= ${cutoff}
          LIMIT ${BATCH_SIZE}
        )
      `);

      this.logger.log({
        msg: 'WorkspacePurgeJob completed',
        posts,
        accounts,
        members,
        invitations,
        workspaces,
      });
    } catch (err) {
      this.logger.error({ msg: 'WorkspacePurgeJob failed', err });
    }
  }

  /**
   * Executes a batched DELETE statement in a loop until no rows remain.
   *
   * Each iteration deletes at most `BATCH_SIZE` rows. The loop exits when the
   * driver reports `rowCount = 0` (no more matching rows).
   *
   * @param conn - Raw database connection from the forked EntityManager.
   * @param sql  - DELETE statement using a `WHERE id IN (SELECT ... LIMIT N)` subquery.
   * @returns Total number of rows deleted across all iterations.
   */
  private async batchDelete(
    conn: { execute: <T>(sql: string) => Promise<T> },
    sql: string,
  ): Promise<number> {
    let total = 0;
    let deleted: number;
    do {
      const result = await conn.execute<{ rowCount?: number }>(sql);
      deleted = result.rowCount ?? 0;
      total += deleted;
    } while (deleted > 0);
    return total;
  }
}
