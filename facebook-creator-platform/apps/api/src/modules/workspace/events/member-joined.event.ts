import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Raised after an invitation is accepted and the new `WorkspaceMember` is persisted.
 *
 * Consumed by the Notification Service (T4.2) to upsert `workspace_members_projection`
 * and by the Audit Service (T3.4) to record the membership join. No PII in payload.
 */
export class MemberJoinedEvent extends DomainEvent {
  /** @inheritdoc */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for the `fcp.events` topic exchange. */
  readonly routingKey = 'workspace.member-joined' as const;

  /**
   * @param workspaceId - UUID of the workspace the user joined.
   * @param userId      - UUID of the user who accepted the invitation.
   * @param role        - Role granted to the new member.
   * @param invitationId - UUID of the accepted `Invitation` record.
   */
  constructor(
    readonly workspaceId: string,
    readonly userId: string,
    readonly role: 'editor' | 'viewer',
    readonly invitationId: string,
  ) {
    super();
  }
}
