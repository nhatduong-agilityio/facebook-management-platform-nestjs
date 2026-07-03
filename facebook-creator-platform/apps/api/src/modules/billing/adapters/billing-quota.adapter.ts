import { Injectable } from '@nestjs/common';
import { IPostQuotaProvider } from '../../posts/ports/post-quota.provider.port';
import { IBillingHttpClient } from '../ports/billing-http.client.port';

/**
 * Implements `IPostQuotaProvider` by calling `services/billing` over HTTP.
 *
 * Delegates to `IBillingHttpClient.getPostLimit`, which handles graceful fallback
 * to the free-plan default when the billing service is unreachable.
 */
@Injectable()
export class BillingQuotaAdapter extends IPostQuotaProvider {
  constructor(private readonly billingClient: IBillingHttpClient) {
    super();
  }

  /** @inheritdoc */
  async getPostLimit(workspaceId: string): Promise<number> {
    return this.billingClient.getPostLimit(workspaceId);
  }
}
