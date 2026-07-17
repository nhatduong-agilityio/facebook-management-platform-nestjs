import { Injectable, Logger } from '@nestjs/common';
import { IPostQuotaProvider } from '../../posts/ports/post-quota.provider.port';
import { IBillingHttpClient } from '../ports/billing-http.client.port';
import { DownstreamServiceError } from '../../../common/http/http-client.port';

/**
 * Free-plan post limit returned when the billing service is unreachable.
 *
 * Using the free-plan limit as the fallback is intentionally conservative —
 * it lets existing workspaces continue creating posts during a billing outage
 * without risking significant over-quota usage.
 */
export const FREE_PLAN_LIMIT = 10;

/**
 * Implements `IPostQuotaProvider` by calling `services/billing` over HTTP.
 *
 * **Fail-open behaviour:** when the billing service responds with a connection
 * error or timeout (`DownstreamServiceError`), `getPostLimit` returns
 * `FREE_PLAN_LIMIT` and logs a warning. This prevents billing outages from
 * blocking post creation entirely (CLAUDE.md guardrails — constant only,
 * no Redis cache before T5.5 load-test results).
 */
@Injectable()
export class BillingQuotaAdapter extends IPostQuotaProvider {
  private readonly logger = new Logger(BillingQuotaAdapter.name);

  /** @param billingClient - HTTP client for `services/billing`. */
  constructor(private readonly billingClient: IBillingHttpClient) {
    super();
  }

  /**
   * Returns the post limit for the workspace's current plan.
   *
   * Falls back to `FREE_PLAN_LIMIT` when the billing service is unreachable
   * and logs a warning so on-call engineers can investigate.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Post limit from billing, or `FREE_PLAN_LIMIT` on service failure.
   */
  async getPostLimit(workspaceId: string): Promise<number> {
    try {
      return await this.billingClient.getPostLimit(workspaceId);
    } catch (err) {
      if (err instanceof DownstreamServiceError) {
        this.logger.warn(
          `Billing service unreachable (${err.status}); falling back to FREE_PLAN_LIMIT=${FREE_PLAN_LIMIT} for workspace ${workspaceId}`,
        );
        return FREE_PLAN_LIMIT;
      }
      throw err;
    }
  }
}
