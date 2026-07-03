import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a new `Post` is persisted and the Unit of Work is flushed.
 *
 * Published to the event bus **after** `em.flush()` (§6 — never before commit).
 * Carries enough indexable content for the Search Service (T4.1) to build an
 * Algolia record without any HTTP call back to `apps/api` (CQRS principle —
 * ADR-051: events are the read-model source of truth for downstream services).
 *
 * No PII: all fields are UUIDs, user-supplied post content, or timestamps.
 */
export class PostCreatedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'posts.created' as const;

  /**
   * @param postId          - UUID v7 of the newly created post.
   * @param workspaceId     - UUID of the workspace that owns the post.
   * @param createdByUserId - UUID of the user who created the post.
   * @param title           - Optional post title (indexable by Search Service).
   * @param content         - Post body text (indexable by Search Service).
   * @param status          - Initial status (`'draft'`).
   * @param scheduledAt     - Scheduled publish time, if set at creation.
   * @param createdAt       - Creation timestamp (used for index ordering).
   */
  constructor(
    readonly postId: string,
    readonly workspaceId: string,
    readonly createdByUserId: string,
    readonly title: string | undefined,
    readonly content: string,
    readonly status: string,
    readonly scheduledAt: Date | undefined,
    readonly createdAt: Date,
  ) {
    super();
  }
}
