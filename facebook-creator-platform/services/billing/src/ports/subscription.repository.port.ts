import type { Subscription } from '../entities/subscription.entity';

/**
 * Port (outbound): persists and queries `billing.subscriptions`.
 */
export abstract class ISubscriptionRepository {
  /**
   * Finds a workspace's subscription, or `null` if none exists.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns The Subscription with `plan` populated, or `null`.
   */
  abstract findByWorkspaceId(workspaceId: string): Promise<Subscription | null>;

  /**
   * Finds a subscription by its Stripe Subscription ID, or `null` if not found.
   *
   * Used by webhook handlers to correlate Stripe events with local subscriptions.
   *
   * @param stripeSubscriptionId - The Stripe subscription ID (e.g. `sub_xxx`).
   * @returns The Subscription with `plan` populated, or `null`.
   */
  abstract findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null>;

  /**
   * Schedules a subscription for persistence in the current Unit-of-Work.
   * Caller must call `em.flush()` to commit.
   *
   * @param subscription - The subscription to persist.
   */
  abstract save(subscription: Subscription): Promise<void>;
}
