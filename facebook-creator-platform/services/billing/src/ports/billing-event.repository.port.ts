import type { BillingEvent } from '../entities/billing-event.entity';

/**
 * Port (outbound): persists and queries `billing.billing_events`.
 */
export abstract class IBillingEventRepository {
  /**
   * Finds a billing event by its Stripe event ID (BR-R04 idempotency check).
   *
   * @param stripeEventId - The Stripe event ID to look up.
   * @returns The existing `BillingEvent`, or `null` if not yet processed.
   */
  abstract findByStripeEventId(stripeEventId: string): Promise<BillingEvent | null>;

  /**
   * Schedules a billing event for persistence in the current Unit-of-Work.
   * Caller must call `em.flush()` to commit.
   *
   * @param event - The billing event to persist.
   */
  abstract save(event: BillingEvent): Promise<void>;
}
