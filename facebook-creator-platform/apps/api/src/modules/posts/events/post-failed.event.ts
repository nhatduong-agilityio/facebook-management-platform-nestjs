import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a `Post` transitions to `failed` status and the Unit of Work is flushed.
 *
 * Published to the event bus **after** `em.flush()` (§6).
 * Consumed by:
 * - Notification Service (T4.2) — sends in-app toast + Slack alert.
 * - Email Service (T4.3)        — sends `publish_failed` email to the post author.
 * - Audit Service (T3.4)        — records the failure event.
 *
 * No PII: `createdByUserId` is the internal UUID, not an email or name.
 */
export class PostFailedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'posts.failed' as const;

  /**
   * @param postId          - UUID v7 of the failed post.
   * @param workspaceId     - UUID of the owning workspace.
   * @param createdByUserId - UUID of the post author (Email Service uses this for recipient resolution).
   * @param lastError       - Human-readable error message from the Graph API (safe to log).
   */
  constructor(
    readonly postId: string,
    readonly workspaceId: string,
    readonly createdByUserId: string,
    readonly lastError: string | undefined,
  ) {
    super();
  }
}
