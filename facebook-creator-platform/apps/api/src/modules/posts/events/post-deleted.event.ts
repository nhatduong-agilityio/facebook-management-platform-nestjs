import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a `Post` is soft-deleted and the Unit of Work is flushed.
 *
 * Published to the event bus **after** `em.flush()` (§6).
 * Allows the Search Service (T4.1) to remove the record from the Algolia index.
 * The Audit Service (T3.4) also consumes this to record the deletion.
 *
 * No PII.
 */
export class PostDeletedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'posts.deleted' as const;

  /**
   * @param postId          - UUID v7 of the soft-deleted post.
   * @param workspaceId     - UUID of the owning workspace.
   * @param deletedByUserId - UUID of the user who performed the deletion.
   */
  constructor(
    readonly postId: string,
    readonly workspaceId: string,
    readonly deletedByUserId: string,
  ) {
    super();
  }
}
