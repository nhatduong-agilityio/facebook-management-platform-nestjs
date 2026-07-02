import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted after a new `Post` is persisted and the Unit of Work is flushed.
 *
 * Published to the event bus **after** `em.flush()` (§6 — never before commit).
 * In T2.6 this drives the Audit Service consumer and the Algolia indexer (T4.1).
 *
 * No PII: `postId` and `workspaceId` are UUIDs; `createdByUserId` is the internal
 * user uuid (not an email or name).
 */
export class PostCreatedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();

  /**
   * @param postId          - UUID v7 of the newly created post.
   * @param workspaceId     - UUID of the workspace that owns the post.
   * @param createdByUserId - UUID of the user who created the post.
   */
  constructor(
    readonly postId: string,
    readonly workspaceId: string,
    readonly createdByUserId: string,
  ) {
    super();
  }
}
