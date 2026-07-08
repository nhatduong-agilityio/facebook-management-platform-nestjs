import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { uuidv7 } from 'uuidv7';

/**
 * Valid email types matching the DDL CHECK constraint on `email_type`.
 */
export type EmailType =
  | 'invitation'
  | 'publish_success'
  | 'publish_failed'
  | 'token_expiring'
  | 'payment_failed';

/** Valid delivery statuses. */
export type EmailStatus = 'pending' | 'sent' | 'failed';

/** Email provider implementations. */
export type EmailProvider = 'Resend' | 'SES' | 'SendGrid';

/**
 * Persisted record of every email delivery attempt.
 *
 * Does NOT extend `BaseEntity` — the DDL has `sent_at`/`created_at` only
 * (no `updatedAt` or `deletedAt`). App-generated UUID v7 id per ADR-013
 * (diverges from DDL `DEFAULT gen_random_uuid()`).
 *
 * Uniqueness on `dedupe_key` (`'{eventId}:{recipientEmail}'`) prevents
 * duplicate sends on event replay (BR-R08).
 */
@Entity({ tableName: 'email_delivery_logs', schema: 'email' })
@Unique({ properties: ['dedupeKey'] })
export class EmailDeliveryLog {
  /** App-generated UUID v7 primary key (ADR-013). */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * Logical FK to `core.workspaces.id` (cross-schema, no DB constraint — BR-R06).
   * Indexed for workspace-scoped queries (BR-R08).
   */
  @Property({ type: 'uuid', nullable: true })
  @Index()
  workspaceId?: string;

  /**
   * Logical FK to `core.users.id` (cross-schema, no DB constraint — BR-R06).
   * Indexed for per-user delivery queries (BR-R08).
   */
  @Property({ type: 'uuid', nullable: true })
  @Index()
  userId?: string;

  /** Category of the email; constrained by DDL CHECK to the five allowed types. */
  @Property({ length: 50 })
  emailType!: EmailType;

  /** The recipient's email address. Never logged. */
  @Property({ length: 255 })
  recipientEmail!: string;

  /** Handlebars / Resend template identifier. */
  @Property({ length: 100 })
  templateName!: string;

  /** Which email provider was used to deliver this message. */
  @Property({ length: 30 })
  provider!: EmailProvider;

  /** Delivery status: `pending` on creation, `sent` on success, `failed` after exhaustion. */
  @Property({ length: 15, default: 'pending' })
  status: EmailStatus = 'pending';

  /**
   * Idempotency key: `'{eventId}:{recipientEmail}'`.
   * UNIQUE constraint prevents double-send on event replay (BR-R08).
   */
  @Property({ length: 255 })
  dedupeKey!: string;

  /** Number of delivery attempts consumed; updated on final failure. */
  @Property({ default: 0 })
  retryCount: number = 0;

  /** Entity type the email relates to (`post`, `workspace`, `facebook_account`). */
  @Property({ length: 100, nullable: true })
  relatedEntityType?: string;

  /** UUID of the related entity record (no DB FK — cross-schema). */
  @Property({ type: 'uuid', nullable: true })
  relatedEntityId?: string;

  /** Set when `status` transitions to `sent`. */
  @Property({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  /** Record creation timestamp. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
