import type { WorkspaceRole } from '../types/workspace-role.type';

/**
 * Port (outbound): contract for resolving a user's membership role within a workspace.
 *
 * Backed by the `core.workspace_members` table, which is created in T1.4.
 * The adapter will be relocated to the workspace module at that point; the
 * interface here allows `WorkspaceRolesGuard` to depend on the abstraction now.
 */
export abstract class IWorkspaceMemberRepository {
  /**
   * Looks up the role of a user in a specific workspace.
   *
   * @param userId      - UUID v7 of the authenticated platform user.
   * @param workspaceId - UUID v7 of the target workspace.
   * @returns The member's `WorkspaceRole`, or `null` if the user has no active membership.
   */
  abstract findRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null>;
}
