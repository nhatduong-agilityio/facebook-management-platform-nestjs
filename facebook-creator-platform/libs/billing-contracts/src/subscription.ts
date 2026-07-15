/**
 * Plan summary embedded in `SubscriptionResponse`.
 *
 * Exposes display fields only — never the `stripePriceId`.
 */
export interface PlanSummary {
  /** Short plan code (e.g. `free`, `pro`, `team`). */
  code: string;
  /** Human-readable plan name. */
  name: string;
  /** Maximum non-deleted posts allowed for this plan. */
  postLimit: number;
}

/**
 * Wire shape returned by `GET /workspaces/:id/subscription` on `services/billing`.
 *
 * Consumed by `apps/api` to serve `GET /workspaces/:id/subscription` to API clients.
 * Stripe customer/subscription IDs are **never** included (billing identity PII).
 */
export interface SubscriptionResponse {
  /** UUID v7 of the subscription record. */
  id: string;
  /** UUID of the owning workspace. */
  workspaceId: string;
  /** Current subscription status from the billing state machine. */
  status: 'trialing' | 'active' | 'grace_period' | 'past_due' | 'cancelled';
  /** The plan this subscription is on. */
  plan: PlanSummary;
  /** Start of the current billing period, or `null` if not yet activated. */
  currentPeriodStart: string | null;
  /** End of the current billing period, or `null` if not yet activated. */
  currentPeriodEnd: string | null;
  /** End of the grace period, or `null` if not in `grace_period` status. */
  gracePeriodEnd: string | null;
  /** ISO 8601 timestamp when the subscription was created. */
  createdAt: string;
  /** ISO 8601 timestamp when the subscription was last updated. */
  updatedAt: string;
}
