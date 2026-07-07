import { Entity, ManyToOne, Property, Unique } from '@mikro-orm/decorators/legacy';
import { Notification } from './notification.entity';

/**
 * Per-user delivery record in `notification.notification_recipients`.
 *
 * PKs are app-generated UUID v7 (ADR-013).
 * One row per `(notification_id, user_id)` — enforced by `UNIQUE` constraint in DDL.
 *
 * `readStatus` is **one-way**: `false → true` only (BR-F08). Enforced at the application
 * layer in `NotificationService.markAsRead` and backed by a DB trigger in the migration.
 *
 * Does **not** extend `BaseEntity` — no `updatedAt` / `deletedAt` columns per DDL.
 */
@Entity({ tableName: 'notification_recipients', schema: 'notification' })
@Unique({ properties: ['notification', 'userId'] })
export class NotificationRecipient {
  /** UUID v7 primary key — app-generated before flush. */
  @Property({ primary: true, columnType: 'uuid' })
  id!: string;

  /** The notification this record belongs to. Cascade-deletes when notification is deleted. */
  @ManyToOne(() => Notification, { columnType: 'uuid', deleteRule: 'cascade' })
  notification!: Notification;

  /** UUID of the recipient user (logical FK, BR-R06 — no DB FK constraint). */
  @Property({ columnType: 'uuid' })
  userId!: string;

  /** Whether the user has read this notification. One-way flag (BR-F08). */
  @Property({ default: false })
  readStatus!: boolean;

  /** Timestamp of when the notification was read. Null until `readStatus` is set to `true`. */
  @Property({ columnType: 'timestamptz', nullable: true })
  readAt!: Date | null;

  /** Set by the DB default (`now()`). Append-only — never updated. */
  @Property({ columnType: 'timestamptz' })
  createdAt!: Date;
}
