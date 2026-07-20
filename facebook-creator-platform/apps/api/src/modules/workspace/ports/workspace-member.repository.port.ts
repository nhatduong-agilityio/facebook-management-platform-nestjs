import type { WorkspaceMember } from '../entities/workspace-member.entity';

/**
 * Opaque keyset cursor payload for member list pagination.
 * Encoded as `base64url(JSON({ joinedAt, id }))`.
 */
export interface ListMembersCursor {
  /** ISO-8601 `joinedAt` of the last row on the previous page. */
  joinedAt: string;
  /** UUID v7 `id` — breaks ties within the same millisecond. */
  id: string;
}

/**
 * Query options for the paginated `findAllByWorkspaceId` method.
 *
 * Defaults: `limit = 50`, no cursor (returns the first page).
 * Maximum `limit` is capped at 100 by the adapter.
 */
export interface ListMembersQuery {
  /** Maximum number of members to return. Default 50; adapter caps at 100. */
  limit?: number;
  /** base64url-encoded `ListMembersCursor` from the previous page response. */
  cursor?: string;
}

/**
 * Result of a paginated `findAllByWorkspaceId` call.
 *
 * `nextCursor` is `null` when there are no more pages.
 */
export interface MembersPage {
  /** Members for this page, ordered `joinedAt ASC, id ASC`. */
  data: WorkspaceMember[];
  /** Opaque cursor for the next page, or `null` on the last page. */
  nextCursor: string | null;
}

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
   * Used by the sole-owner guard (BR-R02) in `removeMember` and `changeMemberRole`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Count of active owner-role members.
   */
  abstract countOwners(workspaceId: string): Promise<number>;

  /**
   * Counts all members of a workspace regardless of role.
   *
   * Used by the workspace-deletion guard (W-1): deletion is only permitted when
   * the requesting owner is the last (sole) member — `count <= 1`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Total number of member records for the workspace.
   */
  abstract countByWorkspace(workspaceId: string): Promise<number>;

  /**
   * Returns a page of membership records for a workspace, ordered by `joinedAt ASC, id ASC`
   * (keyset pagination — §12).
   *
   * Pass `query.cursor` from the previous response's `nextCursor` to advance pages.
   * Default page size is 50; adapter caps at 100.
   *
   * @param workspaceId - UUID of the workspace.
   * @param query       - Pagination options (limit, cursor).
   */
  abstract findAllByWorkspaceId(workspaceId: string, query?: ListMembersQuery): Promise<MembersPage>;

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
