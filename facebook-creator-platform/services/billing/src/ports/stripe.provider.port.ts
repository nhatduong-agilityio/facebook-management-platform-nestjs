import type Stripe from 'stripe';

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
 * Port (outbound): creates Stripe billing sessions and verifies incoming webhooks.
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

  /**
   * Verifies a Stripe webhook `Stripe-Signature` header and parses the event.
   *
   * Throws if the signature is invalid — do not swallow the error (return 400 to Stripe).
   * Uses the Stripe SDK's `webhooks.constructEvent` which performs constant-time HMAC
   * comparison internally.
   *
   * @param payload - Raw request body buffer (requires `rawBody: true` in NestFactory).
   * @param signature - Value of the `Stripe-Signature` header.
   * @param secret    - Webhook endpoint secret (`STRIPE_WEBHOOK_SECRET` env var).
   * @returns The parsed and verified `Stripe.Event`.
   */
  abstract verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event;
}
