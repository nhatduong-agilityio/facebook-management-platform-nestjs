/**
 * Port (outbound): resolves the maximum number of posts allowed for a workspace.
 *
 * The concrete implementation depends on the billing tier:
 * - T2.4: `HardcodedPostQuotaAdapter` returns 10 (free-plan default).
 * - T3.1: swapped for a real billing lookup (`billing.plans.post_limit`).
 *
 * Services call `getPostLimit` before creating a post and return
 * `err(PLAN_LIMIT_EXCEEDED)` when the workspace is at capacity.
 */
export abstract class IPostQuotaProvider {
  /**
   * Returns the maximum number of non-deleted posts the workspace's current plan allows.
   *
   * @param workspaceId - UUID of the workspace to check.
   * @returns The post limit for the workspace's subscription plan.
   */
  abstract getPostLimit(workspaceId: string): Promise<number>;
}
