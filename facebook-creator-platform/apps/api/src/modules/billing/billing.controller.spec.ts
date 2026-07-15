import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingController } from './billing.controller';
import { IBillingHttpClient } from './ports/billing-http.client.port';
import type { CheckoutResponse } from '@fcp/billing-contracts';

describe('BillingController', () => {
  let controller: BillingController;
  let billingClient: IBillingHttpClient;

  beforeEach(() => {
    billingClient = { createCheckoutSession: vi.fn() } as unknown as IBillingHttpClient;
    controller = new BillingController(billingClient);
  });

  describe('createCheckout', () => {
    it('returns the Stripe Checkout URL on success', async () => {
      const response: CheckoutResponse = { url: 'https://checkout.stripe.com/pay/cs_test_abc' };
      vi.mocked(billingClient.createCheckoutSession).mockResolvedValue(response);

      const result = await controller.createCheckout('ws-1', { planCode: 'pro' });

      expect(billingClient.createCheckoutSession).toHaveBeenCalledWith({
        planCode: 'pro',
        workspaceId: 'ws-1',
      });
      expect(result.url).toContain('stripe.com');
    });

    it('throws 500 when the billing client throws', async () => {
      vi.mocked(billingClient.createCheckoutSession).mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(controller.createCheckout('ws-1', { planCode: 'pro' })).rejects.toMatchObject({
        response: { code: 'INTERNAL' },
      });
    });
  });
});
