import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { ref, type Ref } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import { Subscription } from './subscription.entity';
import type { SubscriptionStatus } from './subscription.entity';

/**
 * Payload shape stored in `billing_events.event_payload`.
 *
 * Captures the from/to transition context without PII (no Stripe customer/subscription IDs).
 */
export interface BillingEventPayload {
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  workspaceId: string;
  planCode: string;
}

/**
 * An immutable audit record of every Stripe webhook processed by the billing service.
 *
 * Stored in `billing.billing_events`. The UNIQUE constraint on `stripe_event_id` (BR-R04)
 * is the idempotency key — duplicate Stripe deliveries are detected via a
 * find-before-insert check and rejected silently with HTTP 200.
 *
 * No `updatedAt` — this is an append-only log per CLAUDE.md §3 exception.
 */
@Entity({ tableName: 'billing_events', schema: 'billing' })
@Unique({ properties: ['stripeEventId'] })
export class BillingEvent {
  /** Application-generated UUID v7 primary key (ADR-013). No DB DEFAULT. */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * The Stripe event ID (e.g. `evt_xxx`). UNIQUE — used as the idempotency key (BR-R04).
   * Must not be logged as it indirectly identifies the billing customer.
   */
  @Property({ length: 255 })
  stripeEventId!: string;

  /** Stripe event type string (e.g. `invoice.payment_succeeded`). */
  @Property({ length: 100 })
  eventType!: string;

  /** Structured payload capturing the from/to transition and workspace context. No PII. */
  @Property({ type: 'jsonb' })
  eventPayload!: BillingEventPayload;

  /** Timestamp from the Stripe event (`event.created * 1000`). */
  @Property({ type: 'timestamptz' })
  occurredAt!: Date;

  /**
   * The subscription this event is associated with.
   * Nullable — `checkout.session.completed` may fire before a subscription row exists.
   */
  @ManyToOne({ entity: () => Subscription, nullable: true, index: true })
  subscription?: Ref<Subscription>;

  /** Row creation timestamp. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  /**
   * Creates a `BillingEvent` record for a state transition.
   *
   * @param stripeEventId - The Stripe event ID (idempotency key).
   * @param eventType     - Stripe event type string.
   * @param payload       - Transition context (from/to status, workspaceId, planCode).
   * @param occurredAt    - Timestamp of the Stripe event.
   * @param subscription  - The subscription that transitioned (if resolved).
   * @returns A new `BillingEvent` ready for `em.persist()`.
   */
  static create(
    stripeEventId: string,
    eventType: string,
    payload: BillingEventPayload,
    occurredAt: Date,
    subscription?: Subscription,
  ): BillingEvent {
    const ev = new BillingEvent();
    ev.stripeEventId = stripeEventId;
    ev.eventType = eventType;
    ev.eventPayload = payload;
    ev.occurredAt = occurredAt;
    if (subscription) {
      ev.subscription = ref(subscription);
    }
    return ev;
  }
}
