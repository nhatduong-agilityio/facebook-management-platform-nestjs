import { Entity, Property } from '@mikro-orm/decorators/legacy';
import type { Opt } from '@mikro-orm/core';

/**
 * Notification types that can be produced by the system.
 *
 * Each value maps 1-to-1 to a RabbitMQ routing key that triggered the notification.
 */
export type NotificationType =
  | 'posts.published'
  | 'posts.failed'
  | 'billing.subscription_activated'
  | 'billing.subscription_cancelled'
  | 'billing.subscription_past_due'
  | 'billing.payment_failed'
  | 'facebook.token_expiring';

/**
 * Persisted notification record in the `notification.notifications` table.
 *
 * PKs are app-generated UUID v7 (ADR-013) — overrides the DDL `DEFAULT gen_random_uuid()`.
 * This entity does **not** extend `BaseEntity`; the DDL has no `updatedAt` / `deletedAt`
 * columns on this table.
 *
 * Recipients are stored in `NotificationRecipient`. One notification can have many recipients.
 */
@Entity({ tableName: 'notifications', schema: 'notification' })
export class Notification {
  /** UUID v7 primary key — app-generated before flush. */
  @Property({ primary: true, columnType: 'uuid' })
  id!: string;

  /** UUID of the workspace this notification belongs to (logical FK, BR-R06). */
  @Property({ columnType: 'uuid' })
  workspaceId!: string;

  /** Notification category — maps to the event routing key that produced it. */
  @Property({ length: 50 })
  type!: NotificationType;

  /** Short human-readable title (max 150 chars per DDL). */
  @Property({ length: 150 })
  title!: string;

  /** Full notification message body. */
  @Property({ columnType: 'text' })
  message!: string;

  /** Optional structured event payload for deep linking or rendering. */
  @Property({ columnType: 'jsonb', nullable: true })
  payload?: Opt<Record<string, unknown>>;

  /** Set by the DB default (`now()`). Append-only — never updated. */
  @Property({ columnType: 'timestamptz' })
  createdAt!: Date;
}
