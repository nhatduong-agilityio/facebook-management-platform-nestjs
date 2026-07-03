/**
 * Request body sent from `apps/api` to `services/billing POST /checkout`.
 *
 * `apps/api` validates `planCode` and extracts `workspaceId` from the route param
 * before forwarding this payload to the billing service.
 */
export interface CheckoutRequest {
  /** Plan code the workspace wants to subscribe to (`pro` or `team`). */
  planCode: string;
  /** UUID of the workspace initiating checkout. Stored in Stripe session metadata. */
  workspaceId: string;
}

/**
 * Response returned by `services/billing POST /checkout`.
 */
export interface CheckoutResponse {
  /** Stripe-hosted Checkout URL the client must redirect to. */
  url: string;
}
