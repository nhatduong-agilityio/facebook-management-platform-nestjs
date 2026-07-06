import type { WorkspaceMember } from '../entities/workspace-member.entity';

/**
 * Port (outbound): full persistence contract for workspace membership records.
 *
 * Used by `WorkspaceService` for:
 * - Seeding the owner membership on workspace creation (`persist`).
 * - Membership checks and sole-owner guard (`findByWorkspaceAndId`, `countOwners`).
 * - Member removal (`remove`).
 */
export abstract class IWorkspaceMemberRepository {
  /**
   * Stages a new `WorkspaceMember` entity in the Unit of Work without flushing.
   * Callers flush via `IWorkspaceRepository.save` to keep the transaction atomic.
   *
   * @param member - The entity to stage for insertion.
   */
  abstract persist(member: WorkspaceMember): void;

  /**
   * Finds a membership record scoped to a specific workspace.
   *
   * @param workspaceId - UUID of the workspace.
   * @param memberId    - UUID of the membership record.
   * @returns The member, or `null` if not found in that workspace.
   */
  abstract findByWorkspaceAndId(workspaceId: string, memberId: string): Promise<WorkspaceMember | null>;

  /**
   * Counts how many `owner`-role members the workspace has.
   * Used by the sole-owner guard (BR-R02).
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Count of active owner-role members.
   */
  abstract countOwners(workspaceId: string): Promise<number>;

  /**
   * Returns all membership records for a workspace, ordered by `joinedAt` ascending.
   *
   * @param workspaceId - UUID of the workspace.
   */
  abstract findAllByWorkspaceId(workspaceId: string): Promise<WorkspaceMember[]>;

  /**
   * Removes a membership record and flushes the Unit of Work.
   *
   * @param member - The entity to delete.
   */
  abstract remove(member: WorkspaceMember): Promise<void>;

  /**
   * Finds a membership record by workspace and user id.
   *
   * Used by the role-change endpoint (`PATCH /workspaces/:id/members/:userId/role`)
   * where the URL carries the user's UUID, not the membership record UUID.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the user.
   * @returns The member, or `null` if not found in that workspace.
   */
  abstract findByWorkspaceAndUserId(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;

  /**
   * Persists a new or mutated `WorkspaceMember` and flushes the Unit of Work.
   *
   * For new members this is equivalent to `em.persist(member) + em.flush()`.
   * For already-tracked entities the `persist` call is a no-op and only the flush runs,
   * committing any in-flight mutations (e.g. invitation status + member insert together).
   *
   * @param member - The entity to upsert.
   */
  abstract save(member: WorkspaceMember): Promise<void>;
}
