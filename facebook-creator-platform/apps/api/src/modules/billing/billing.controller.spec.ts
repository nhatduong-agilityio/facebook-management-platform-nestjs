import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingController } from './billing.controller';
import { IBillingHttpClient } from './ports/billing-http.client.port';
import { DownstreamServiceError } from '../../common/http/http-client.port';
import type { CheckoutResponse, SubscriptionResponse } from '@fcp/billing-contracts';

const makeSubscriptionResponse = (): SubscriptionResponse => ({
  id: 'sub-1',
  workspaceId: 'ws-1',
  status: 'active',
  plan: { code: 'pro', name: 'Pro', postLimit: 500 },
  currentPeriodStart: '2026-07-01T00:00:00Z',
  currentPeriodEnd: '2026-08-01T00:00:00Z',
  gracePeriodEnd: null,
  createdAt: '2026-07-01T12:00:00Z',
  updatedAt: '2026-07-15T09:30:00Z',
});

describe('BillingController', () => {
  let controller: BillingController;
  let billingClient: IBillingHttpClient;

  beforeEach(() => {
    billingClient = {
      createCheckoutSession: vi.fn(),
      getSubscription: vi.fn(),
    } as unknown as IBillingHttpClient;
    controller = new BillingController(billingClient);
  });

  describe('getSubscription', () => {
    it('returns subscription details for a workspace', async () => {
      const sub = makeSubscriptionResponse();
      vi.mocked(billingClient.getSubscription).mockResolvedValue(sub);

      const result = await controller.getSubscription('ws-1');

      expect(billingClient.getSubscription).toHaveBeenCalledWith('ws-1');
      expect(result.status).toBe('active');
      expect(result.plan.code).toBe('pro');
      expect(result.currentPeriodStart).toBe('2026-07-01T00:00:00Z');
    });

    it('throws 404 when the workspace has no subscription', async () => {
      vi.mocked(billingClient.getSubscription).mockRejectedValue(
        new DownstreamServiceError(404, 'http://localhost:3001'),
      );

      await expect(controller.getSubscription('ws-no-sub')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });

    it('throws 503 when the billing service is unreachable', async () => {
      vi.mocked(billingClient.getSubscription).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3001'),
      );

      await expect(controller.getSubscription('ws-1')).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });
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
