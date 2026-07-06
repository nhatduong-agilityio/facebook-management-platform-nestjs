import { uuidv7 } from 'uuidv7';
import type { WorkspaceRole } from '../../identity/types/workspace-role.type';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Raised after a workspace member's role is changed and the update is flushed.
 *
 * Consumed by the Notification Service (T4.2) to update `workspace_members_projection`
 * and by the Audit Service (T3.4) to record the role change. No PII in payload.
 */
export class MemberRoleChangedEvent extends DomainEvent {
  /** @inheritdoc */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for the `fcp.events` topic exchange. */
  readonly routingKey = 'workspace.role-changed' as const;

  /**
   * @param workspaceId     - UUID of the workspace.
   * @param userId          - UUID of the member whose role changed.
   * @param oldRole         - Previous role before the change.
   * @param newRole         - New role after the change.
   * @param changedByUserId - UUID of the user who performed the change.
   */
  constructor(
    readonly workspaceId: string,
    readonly userId: string,
    readonly oldRole: WorkspaceRole,
    readonly newRole: WorkspaceRole,
    readonly changedByUserId: string,
  ) {
    super();
  }
}
