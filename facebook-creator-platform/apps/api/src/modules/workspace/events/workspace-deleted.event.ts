import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a workspace and all its children are soft-deleted and the Unit of
 * Work is flushed (§6 — never before commit).
 *
 * Consumers:
 * - Audit Service (`#` binding): records the deletion for GDPR traceability.
 * - `services/billing` (`workspace.deleted` binding): cancels the active subscription
 *   via choreography (ADR-109 Fix 4 — replaces synchronous TCP call).
 *
 * No PII: all fields are UUIDs, plain strings, timestamps, or counts.
 */
export class WorkspaceDeletedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for the `fcp.events` topic exchange. */
  readonly routingKey = 'workspace.deleted' as const;

  /**
   * @param workspaceId       - UUID v7 of the soft-deleted workspace.
   * @param workspaceName     - Display name of the workspace (for audit readability).
   * @param deletedBy         - UUID of the owner who triggered the deletion.
   * @param deletedAt         - Timestamp when `deletedAt` was set (from the entity).
   * @param cancelledPostCount - Number of non-terminal posts soft-deleted in the cascade.
   * @param memberCount       - Total member count at deletion time (always 1 per BR-R02).
   */
  constructor(
    readonly workspaceId: string,
    readonly workspaceName: string,
    readonly deletedBy: string,
    readonly deletedAt: Date,
    readonly cancelledPostCount: number,
    readonly memberCount: number,
  ) {
    super();
  }
}
