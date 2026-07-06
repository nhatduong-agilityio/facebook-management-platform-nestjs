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

  /**
   * Looks up an invitation by its single-use token.
   *
   * Returns the invitation regardless of status — the caller is responsible for
   * checking `status === 'pending'` and `expiresAt > now()` (BR-F03).
   *
   * @param token - 64-char hex token from the invitation email link.
   * @returns The invitation, or `null` if no record matches.
   */
  abstract findByToken(token: string): Promise<Invitation | null>;
}
