import { AuditEvent } from '../entities/audit-event.entity';

/**
 * Data required to create an audit document.
 */
export interface InsertAuditEventData {
  eventId: string;
  routingKey: string;
  workspaceId: string | null;
  payload: Record<string, unknown>;
}

/**
 * Options for workspace-scoped audit log queries.
 */
export interface FindByWorkspaceOptions {
  /** Maximum number of results to return (default: 50). */
  limit?: number;
  /** Cursor-based offset — return events received before this date. */
  before?: Date;
}

/**
 * Port (outbound): persistence contract for `audit_events` documents.
 *
 * Bound to `MikroOrmAuditEventRepository` in `AuditModule`.
 * Used as the DI token via the abstract class itself.
 */
export abstract class IAuditEventRepository {
  /**
   * Persists one audit document.
   *
   * Implementors must silently ignore MongoDB duplicate-key errors (code 11000)
   * so that re-delivered events are no-ops.
   *
   * @param data - Fields to write into the new document.
   */
  abstract insert(data: InsertAuditEventData): Promise<void>;

  /**
   * Returns audit documents for a workspace, newest first.
   *
   * @param workspaceId - UUID of the workspace to query.
   * @param opts        - Pagination options.
   */
  abstract findByWorkspace(workspaceId: string, opts?: FindByWorkspaceOptions): Promise<AuditEvent[]>;

  /**
   * Finds a single audit document by its `_id`.
   *
   * @param id - The document `_id` (UUID v7).
   * @returns The document, or `null` if not found.
   */
  abstract findById(id: string): Promise<AuditEvent | null>;
}
