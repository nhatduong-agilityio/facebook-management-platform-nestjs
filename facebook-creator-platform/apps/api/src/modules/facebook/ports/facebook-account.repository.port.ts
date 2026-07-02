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
   * Finds a `FacebookAccount` by its Facebook Page ID.
   *
   * @param pageId - Facebook Page ID to look up.
   * @returns The matching account, or `null` if none exists.
   */
  abstract findByPageId(pageId: string): Promise<FacebookAccount | null>;

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
