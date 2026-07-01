import type { Invitation } from '../entities/invitation.entity';

/**
 * Port (outbound): persistence contract for workspace invitations.
 */
export abstract class IInvitationRepository {
  /**
   * Persists a new invitation and flushes the Unit of Work.
   *
   * @param invitation - The invitation entity to insert.
   */
  abstract save(invitation: Invitation): Promise<void>;

  /**
   * Looks up a pending invitation for a given workspace and email address.
   * Used to prevent duplicate pending invitations for the same email.
   *
   * @param workspaceId - UUID of the workspace.
   * @param email       - Email address to check.
   * @returns The matching pending invitation, or `null` if none exists.
   */
  abstract findPendingByWorkspaceAndEmail(workspaceId: string, email: string): Promise<Invitation | null>;
}
