import type { FacebookAccount } from '../entities/facebook-account.entity';

/**
 * Data required to create or update a `FacebookAccount` record.
 * Callers supply plaintext values; the adapter handles encryption.
 */
export interface FacebookPageConnectData {
  /** Facebook Page ID (external identifier). */
  pageId: string;
  /** Facebook Page display name. */
  pageName: string;
  /** Plaintext Page access token (will be stored encrypted). */
  accessToken: string;
  /** Token expiry, or `null` if the token has no expiry. */
  tokenExpiresAt: Date | null;
}

/**
 * Port: persistence contract for `FacebookAccount` aggregates.
 *
 * Implementations handle all ORM details (entity creation, `em.getReference`,
 * `persist`, `flush`). Services depend on this abstract class only (§14).
 */
export abstract class IFacebookAccountRepository {
  /**
   * Finds a `FacebookAccount` by its primary key.
   *
   * Used by the internal API endpoint (`GET /internal/facebook-accounts/:id`)
   * to resolve a decrypted page token for cross-service token resolution (ADR-050).
   * No workspace scope — callers must be authorised via `InternalSecretGuard`.
   *
   * @param id - UUID v7 of the `FacebookAccount` record.
   * @returns The matching account, or `null` if none exists.
   */
  abstract findById(id: string): Promise<FacebookAccount | null>;

  /**
   * Finds a `FacebookAccount` by its Facebook Page ID.
   *
   * @param pageId - Facebook Page ID to look up.
   * @returns The matching account, or `null` if none exists.
   */
  abstract findByPageId(pageId: string): Promise<FacebookAccount | null>;

  /**
   * Finds a `FacebookAccount` by its primary key, scoped to a specific workspace.
   *
   * Returns `null` if the account does not exist **or** belongs to a different workspace,
   * preventing cross-workspace token access without a separate guard.
   *
   * @param id          - UUID v7 of the `FacebookAccount` record.
   * @param workspaceId - UUID of the owning workspace.
   * @returns The matching account, or `null` if not found in that workspace.
   */
  abstract findByIdAndWorkspace(id: string, workspaceId: string): Promise<FacebookAccount | null>;

  /**
   * Persists changes to an already-tracked `FacebookAccount` entity.
   *
   * Calls `em.flush()` only — the entity must already be managed by the current
   * MikroORM Unit of Work (i.e. loaded via `findByIdAndWorkspace` or `findByPageId`
   * in the same request context). Do not call on a detached entity.
   *
   * @param account - The managed entity whose changes should be flushed.
   */
  abstract save(account: FacebookAccount): Promise<void>;

  /**
   * Returns all active (non-deleted) connected Facebook Pages for a workspace.
   *
   * Used by `GET /workspaces/:id/facebook/pages` to list connected Pages.
   * Results are ordered by `connectedAt DESC` so the most recently connected
   * page appears first. Access tokens are **never** included in the returned objects
   * (BR-F11); callers receive only metadata (id, pageId, pageName, connectedAt).
   *
   * @param workspaceId - UUID of the workspace.
   * @returns All non-deleted `FacebookAccount` records for the workspace, newest first.
   */
  abstract findAllByWorkspace(workspaceId: string): Promise<FacebookAccount[]>;

  /**
   * Soft-deletes all active Facebook Page connections for a workspace **without flushing**.
   *
   * Loads all non-deleted `FacebookAccount` rows for the workspace into the current
   * Unit of Work and marks each `deletedAt = now()`. The caller is responsible for
   * calling `em.flush()` to commit the changes atomically together with other
   * cascade mutations (W-1, §6).
   *
   * @param workspaceId - UUID of the workspace being deleted.
   */
  abstract softDeleteAllByWorkspace(workspaceId: string): Promise<void>;

  /**
   * Creates or updates a `FacebookAccount` for the given workspace and page.
   *
   * If a record with `data.pageId` already exists, its token is refreshed via
   * `updateToken()` and the updated record is returned. Otherwise a new record
   * is created with `FacebookAccount.connect()` and persisted.
   *
   * A single `em.flush()` is called — this is the unit-of-work boundary for
   * single-page writes.
   *
   * @param workspaceId - UUID of the workspace that owns the Page connection.
   * @param data        - Page metadata and access token.
   * @returns The persisted (new or updated) `FacebookAccount`.
   */
  abstract connectPage(workspaceId: string, data: FacebookPageConnectData): Promise<FacebookAccount>;
}
