/**
 * Response returned by `services/billing GET /workspaces/:workspaceId/quota`.
 *
 * Used by `apps/api BillingQuotaAdapter` to implement `IPostQuotaProvider`.
 */
export interface QuotaResponse {
  /** Maximum number of non-deleted posts the workspace's current plan allows. */
  postLimit: number;
}
