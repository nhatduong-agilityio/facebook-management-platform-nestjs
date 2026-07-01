import type { Workspace } from '../entities/workspace.entity';

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
   * Returns all workspaces where the given user holds any membership role.
   *
   * @param userId - UUID v7 of the platform user.
   * @returns Array of active workspaces; empty array when the user has no memberships.
   */
  abstract findAllByUserId(userId: string): Promise<Workspace[]>;

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
