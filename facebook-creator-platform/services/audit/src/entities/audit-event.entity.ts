import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { uuidv7 } from 'uuidv7';

/**
 * A single audit record representing one event received from the `fcp.events` exchange.
 *
 * Stored in the `audit_events` MongoDB collection (owned by `services/audit`).
 * Append-only — no `deletedAt`/`updatedAt` (CLAUDE.md messaging-infra exception).
 *
 * Idempotency: `eventId` has a unique index. Duplicate deliveries trigger a MongoDB
 * duplicate-key error (code 11000) which the repository catches and discards — no
 * Redis dedup key needed (ADR-064).
 *
 * PII: the `payload` field stores the raw event after stripping known PII fields
 * (`email`, `fullName`, `accessToken`, `pageToken`). Publishers are responsible for
 * not embedding raw secrets, but the consumer also strips as a defence-in-depth measure.
 */
@Entity({ collection: 'audit_events' })
@Unique({ properties: ['eventId'] })
export class AuditEvent {
  /**
   * Application-generated UUID v7 primary key stored as MongoDB `_id`.
   * No DB DEFAULT — created before persistence (ADR-013).
   */
  @PrimaryKey({ type: 'string', fieldName: '_id' })
  _id: string = uuidv7();

  /**
   * UUID v7 carried by every `DomainEvent`. Unique across the collection —
   * the duplicate-key constraint drives idempotency (ADR-064).
   * Uniqueness is enforced via `@Unique({ properties: ['eventId'] })` on the class.
   */
  @Property()
  eventId!: string;

  /** AMQP routing key of the event (e.g. `posts.published`, `workspace.member-invited`). */
  @Property()
  routingKey!: string;

  /**
   * UUID of the workspace the event belongs to, extracted from the payload.
   * `null` for platform-level events that have no workspace scope (e.g. `facebook.page.deauthorized`).
   * Indexed to support `GET /workspaces/:id/audit-logs` (T3.5).
   */
  @Index()
  @Property({ nullable: true })
  workspaceId!: string | null;

  /**
   * Full event payload with PII fields stripped.
   * Stored as a raw BSON document — schemaless by design.
   */
  @Property({ type: 'any' })
  payload!: Record<string, unknown>;

  /** UTC timestamp when this service received the event. */
  @Property()
  receivedAt: Date = new Date();
}
