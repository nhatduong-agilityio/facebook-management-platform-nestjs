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
