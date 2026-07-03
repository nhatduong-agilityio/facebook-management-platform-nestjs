import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Raised after a workspace member is removed.
 *
 * Consumed by the Audit Service (T3.4) to record the removal.
 */
export class MemberRemovedEvent extends DomainEvent {
  /** @inheritdoc */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'workspace.member-removed' as const;

  /**
   * @param workspaceId      - UUID of the workspace the member was removed from.
   * @param removedUserId    - UUID of the user who was removed.
   * @param removedByUserId  - UUID of the user who performed the removal.
   */
  constructor(
    readonly workspaceId: string,
    readonly removedUserId: string,
    readonly removedByUserId: string,
  ) {
    super();
  }
}
