import type { CheckoutRequest, CheckoutResponse, SubscriptionResponse } from '@fcp/billing-contracts';

export type { CheckoutRequest, CheckoutResponse, SubscriptionResponse };

/**
 * Port (outbound): typed HTTP client for `services/billing`.
 *
 * Implemented by `BillingHttpClientAdapter` which calls the billing service over HTTP.
 * All methods are fire-and-check — callers handle service-unavailable scenarios.
 */
export abstract class IBillingHttpClient {
  /**
   * Calls `services/billing POST /checkout` and returns the Stripe Checkout URL.
   *
   * @param params - `CheckoutRequest` — `planCode` and `workspaceId`.
   * @returns `CheckoutResponse` — the Stripe-hosted Checkout URL.
   * @throws If the billing service is unreachable or returns an error response.
   */
  abstract createCheckoutSession(params: CheckoutRequest): Promise<CheckoutResponse>;

  /**
   * Calls `services/billing GET /workspaces/:workspaceId/quota` and returns the post limit.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns The maximum number of non-deleted posts the workspace's plan allows.
   */
  abstract getPostLimit(workspaceId: string): Promise<number>;

  /**
   * Calls `services/billing GET /workspaces/:workspaceId/subscription`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns `SubscriptionResponse` — current subscription with plan metadata.
   * @throws `DownstreamServiceError` with status 404 when no subscription exists.
   */
  abstract getSubscription(workspaceId: string): Promise<SubscriptionResponse>;
}
