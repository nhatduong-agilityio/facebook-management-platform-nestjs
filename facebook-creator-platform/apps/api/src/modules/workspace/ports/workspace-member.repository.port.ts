import type { WorkspaceMember } from '../entities/workspace-member.entity';

/**
 * Port (outbound): persistence contract for workspace membership records.
 *
 * Used by `WorkspaceService` to seed the owner membership on workspace creation.
 * Full member management (invite, remove, role change) is added in T1.5.
 */
export abstract class IWorkspaceMemberWriteRepository {
  /**
   * Persists a new workspace member record within the current Unit of Work.
   *
   * Does NOT flush — callers are responsible for calling `flush()` after all
   * related mutations, keeping the create-workspace operation in one transaction.
   *
   * @param member - The `WorkspaceMember` entity to stage for insertion.
   */
  abstract persist(member: WorkspaceMember): void;
}
