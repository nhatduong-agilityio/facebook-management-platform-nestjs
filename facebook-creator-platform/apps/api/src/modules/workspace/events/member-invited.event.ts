import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Raised after a workspace invitation is persisted.
 *
 * Consumed by the Email Service (T4.3) to send the invitation email, and by
 * the Audit Service (T3.4) to record the action. PII (`email`) must be stripped
 * from the audit payload — the email consumer reads it from the invitation record.
 */
export class MemberInvitedEvent extends DomainEvent {
  /** @inheritdoc */
  readonly eventId: string = uuidv7();

  /**
   * @param workspaceId    - UUID of the workspace the invitation was issued for.
   * @param invitationId   - UUID of the newly created `Invitation` record.
   * @param email          - Invited email address. Strip before forwarding to audit.
   * @param role           - Role the invitee will receive on acceptance.
   * @param invitedByUserId - UUID of the user who issued the invitation.
   */
  constructor(
    readonly workspaceId: string,
    readonly invitationId: string,
    readonly email: string,
    readonly role: 'editor' | 'viewer',
    readonly invitedByUserId: string,
  ) {
    super();
  }
}
