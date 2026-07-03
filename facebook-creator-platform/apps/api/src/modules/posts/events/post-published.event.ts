import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a `Post` transitions to `published` status and the Unit of Work is flushed.
 *
 * Published to the event bus **after** `em.flush()` (§6 — never before commit).
 * Consumed in T2.6 (RabbitMQ), T3.3 (Analytics — triggers Graph API metrics sync),
 * T4.1 (Algolia — updates search index with `published` status).
 *
 * No PII: all fields are UUIDs or the Facebook-issued post id (not a user identifier).
 */
export class PostPublishedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'posts.published' as const;

  /**
   * @param postId              - UUID v7 of the post that was published.
   * @param workspaceId         - UUID of the workspace that owns the post.
   * @param facebookGraphPostId - Graph API post id captured synchronously during publishing.
   * @param facebookAccountId   - UUID of the `FacebookAccount` (Page) that published the post.
   *                             Used by the Analytics Service (T3.3) to resolve a page token
   *                             via `GET /internal/facebook-accounts/:id/token` on apps/api.
   * @param createdByUserId     - UUID of the user who created the post.
   *                             Used by the Email Service (T4.3) to resolve a recipient email
   *                             via `GET /internal/users/:id/email` on apps/api.
   */
  constructor(
    readonly postId: string,
    readonly workspaceId: string,
    readonly facebookGraphPostId: string,
    readonly facebookAccountId: string,
    readonly createdByUserId: string,
  ) {
    super();
  }
}
