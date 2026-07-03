import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a `Post` is mutated via `updatePost` and the Unit of Work is flushed.
 *
 * Published to the event bus **after** `em.flush()` (§6).
 * Allows the Search Service (T4.1) to keep the Algolia record in sync with post edits.
 * Only carries fields that are mutable via `PATCH /posts/:id` — not the full entity.
 *
 * No PII.
 */
export class PostUpdatedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'posts.updated' as const;

  /**
   * @param postId      - UUID v7 of the updated post.
   * @param workspaceId - UUID of the owning workspace.
   * @param title       - Updated title (undefined if not changed).
   * @param content     - Updated body text (undefined if not changed).
   * @param scheduledAt - Updated scheduled time (undefined if not changed).
   * @param updatedAt   - Mutation timestamp.
   */
  constructor(
    readonly postId: string,
    readonly workspaceId: string,
    readonly title: string | undefined,
    readonly content: string | undefined,
    readonly scheduledAt: Date | undefined,
    readonly updatedAt: Date,
  ) {
    super();
  }
}
