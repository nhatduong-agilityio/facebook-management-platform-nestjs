import type { Workspace } from '../entities/workspace.entity';

/**
 * Opaque keyset cursor payload for workspace list pagination.
 * Encoded as `base64url(JSON({ createdAt, id }))`.
 */
export interface ListWorkspacesCursor {
  /** ISO-8601 `createdAt` of the last row on the previous page. */
  createdAt: string;
  /** UUID v7 `id` — breaks ties within the same millisecond. */
  id: string;
}

/**
 * Query options for the paginated `findAllByUserId` method.
 *
 * Defaults: `limit = 50`, no cursor (returns the first page).
 * Maximum `limit` is capped at 100 by the adapter.
 */
export interface ListWorkspacesQuery {
  /** Maximum number of workspaces to return. Default 50; adapter caps at 100. */
  limit?: number;
  /** base64url-encoded `ListWorkspacesCursor` from the previous page response. */
  cursor?: string;
}

/**
 * Result of a paginated `findAllByUserId` call.
 *
 * `nextCursor` is `null` when there are no more pages.
 */
export interface WorkspacesPage {
  /** Workspaces for this page, ordered `createdAt DESC, id DESC`. */
  data: Workspace[];
  /** Opaque cursor for the next page, or `null` on the last page. */
  nextCursor: string | null;
}

/**
 * Port (outbound): persistence contract for the Workspace aggregate.
 *
 * Adapters implement this against MikroORM. Services depend only on this abstraction.
 */
export abstract class IWorkspaceRepository {
  /**
   * Finds an active (non-deleted) workspace by its UUID.
   *
   * @param id - UUID v7 of the workspace.
   * @returns The workspace, or `null` if it does not exist or is soft-deleted.
   */
  abstract findById(id: string): Promise<Workspace | null>;

  /**
   * Returns a page of active workspaces where the given user holds any membership role,
   * ordered by `createdAt DESC, id DESC` (keyset pagination — §12).
   *
   * Pass `query.cursor` from the previous response's `nextCursor` to advance pages.
   * Default page size is 50; adapter caps at 100.
   *
   * @param userId - UUID v7 of the platform user.
   * @param query  - Pagination options (limit, cursor).
   */
  abstract findAllByUserId(userId: string, query?: ListWorkspacesQuery): Promise<WorkspacesPage>;

  /**
   * Checks whether a slug is already taken by an active workspace.
   *
   * @param slug - The slug to test.
   * @returns `true` when the slug is in use.
   */
  abstract existsBySlug(slug: string): Promise<boolean>;

  /**
   * Persists a new or updated workspace and flushes the Unit of Work.
   *
   * @param workspace - The workspace entity to persist.
   */
  abstract save(workspace: Workspace): Promise<void>;
}
