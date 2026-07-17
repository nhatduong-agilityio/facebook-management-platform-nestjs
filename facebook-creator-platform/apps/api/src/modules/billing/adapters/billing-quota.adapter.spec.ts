import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingQuotaAdapter, FREE_PLAN_LIMIT } from './billing-quota.adapter';
import { IBillingHttpClient } from '../ports/billing-http.client.port';
import { DownstreamServiceError } from '../../../common/http/http-client.port';

describe('BillingQuotaAdapter', () => {
  let adapter: BillingQuotaAdapter;
  let billingClient: IBillingHttpClient;

  beforeEach(() => {
    billingClient = {
      getPostLimit: vi.fn(),
      createCheckoutSession: vi.fn(),
      getSubscription: vi.fn(),
    } as unknown as IBillingHttpClient;
    adapter = new BillingQuotaAdapter(billingClient);
  });

  describe('getPostLimit', () => {
    it('returns the limit from the billing service when reachable', async () => {
      vi.mocked(billingClient.getPostLimit).mockResolvedValue(500);

      const limit = await adapter.getPostLimit('ws-1');

      expect(limit).toBe(500);
      expect(billingClient.getPostLimit).toHaveBeenCalledWith('ws-1');
    });

    it('returns FREE_PLAN_LIMIT when the billing service is unreachable (fail-open)', async () => {
      vi.mocked(billingClient.getPostLimit).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3001'),
      );

      const limit = await adapter.getPostLimit('ws-1');

      expect(limit).toBe(FREE_PLAN_LIMIT);
    });

    it('re-throws unexpected errors that are not DownstreamServiceError', async () => {
      vi.mocked(billingClient.getPostLimit).mockRejectedValue(new Error('unexpected'));

      await expect(adapter.getPostLimit('ws-1')).rejects.toThrow('unexpected');
    });
  });
});
