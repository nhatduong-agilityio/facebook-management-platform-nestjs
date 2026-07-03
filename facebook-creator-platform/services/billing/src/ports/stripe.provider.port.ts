/**
 * Parameters required to create a Stripe Checkout session.
 */
export interface CreateCheckoutParams {
  /** Stripe Price ID for the selected plan. */
  priceId: string;
  /** UUID of the workspace — stored in session metadata for webhook correlation (T3.2). */
  workspaceId: string;
  /** Redirect URL on successful payment. */
  successUrl: string;
  /** Redirect URL when the customer cancels. */
  cancelUrl: string;
}

/**
 * Port (outbound): creates Stripe billing sessions.
 *
 * Implemented by `StripeAdapter` in production. Can be mocked in unit tests
 * without touching the Stripe API.
 */
export abstract class IStripeProvider {
  /**
   * Creates a Stripe Checkout session for a subscription plan.
   *
   * @param params - Session parameters (price, workspace, redirect URLs).
   * @returns The hosted Checkout session URL the client should redirect to.
   */
  abstract createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string }>;
}
