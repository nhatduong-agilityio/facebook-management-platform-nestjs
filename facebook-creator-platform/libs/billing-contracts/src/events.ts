/**
 * Payload for the `billing.subscription_activated` RabbitMQ event.
 *
 * Published by `services/billing` when a subscription transitions to `active`
 * (first payment success or grace-period recovery). No PII — no Stripe IDs.
 */
export interface SubscriptionActivatedPayload {
  /** Dedup key — uuid v7, unique per event emission. */
  eventId: string;
  /** UUID of the workspace whose subscription became active. */
  workspaceId: string;
  /** Plan code the workspace is now on (`pro` or `team`). */
  planCode: string;
  /** ISO-8601 timestamp of when the transition occurred. */
  occurredAt: string;
}

/**
 * Payload for the `billing.subscription_cancelled` RabbitMQ event.
 *
 * Published by `services/billing` when a subscription transitions to `cancelled`
 * (subscription deleted in Stripe). No PII — no Stripe IDs.
 */
export interface SubscriptionCancelledPayload {
  /** Dedup key — uuid v7, unique per event emission. */
  eventId: string;
  /** UUID of the workspace whose subscription was cancelled. */
  workspaceId: string;
  /** Plan code the workspace was on before cancellation. */
  planCode: string;
  /** ISO-8601 timestamp of when the transition occurred. */
  occurredAt: string;
}

/**
 * Payload for the `billing.subscription_past_due` RabbitMQ event.
 *
 * Published by `services/billing` when Stripe marks a subscription `past_due`
 * (`customer.subscription.updated` with `status === 'past_due'`). No PII — no Stripe IDs.
 */
export interface SubscriptionPastDuePayload {
  /** Dedup key — uuid v7, unique per event emission. */
  eventId: string;
  /** UUID of the workspace whose subscription is past due. */
  workspaceId: string;
  /** Plan code the workspace is on. */
  planCode: string;
  /** ISO-8601 timestamp of when the transition occurred. */
  occurredAt: string;
}

/**
 * Payload for the `billing.payment_failed` RabbitMQ event.
 *
 * Published by `services/billing` on `invoice.payment_failed` when the subscription
 * transitions from `active` to `grace_period` (ADR-054). No PII — no Stripe IDs.
 */
export interface PaymentFailedPayload {
  /** Dedup key — uuid v7, unique per event emission. */
  eventId: string;
  /** UUID of the workspace whose payment failed. */
  workspaceId: string;
  /** Plan code the workspace is on. */
  planCode: string;
  /** ISO-8601 timestamp of when the transition occurred. */
  occurredAt: string;
}

/**
 * Payload for the `billing.subscription_renewed` RabbitMQ event.
 *
 * Published by `services/billing` on `invoice.payment_succeeded` when the
 * subscription is already `active` (i.e. a recurring renewal, not first activation).
 * No PII — no Stripe IDs.
 */
export interface SubscriptionRenewedPayload {
  /** Dedup key — uuid v7, unique per event emission. */
  eventId: string;
  /** UUID of the workspace whose subscription renewed. */
  workspaceId: string;
  /** Plan code the workspace is on. */
  planCode: string;
  /** ISO-8601 timestamp of the renewal (start of the new billing period). */
  renewedAt: string;
}
