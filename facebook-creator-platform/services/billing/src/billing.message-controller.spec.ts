import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { BillingMessageController } from './billing.message-controller';
import { BillingService } from './billing.service';
import type { Subscription } from './entities/subscription.entity';

const mockBilling = {
  getPostLimit: vi.fn(),
  findSubscription: vi.fn(),
  createCheckoutSession: vi.fn(),
} as unknown as BillingService;

/**
 * Minimal subscription stub that satisfies the controller's mapping logic.
 *
 * `unref(sub.plan)` returns the value as-is when it is not a MikroORM
 * `Reference` instance, so a plain object with the plan fields is sufficient.
 */
function makeSubStub(overrides: Partial<Record<string, unknown>> = {}): Subscription {
  return {
    id: 'sub-1',
    workspaceId: 'ws-1',
    status: 'active',
    plan: { code: 'pro', name: 'Pro', postLimit: 100 },
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    gracePeriodEnd: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as unknown as Subscription;
}

describe('BillingMessageController', () => {
  let controller: BillingMessageController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new BillingMessageController(mockBilling);
  });

  // ---------------------------------------------------------------------------
  // billing.get-quota
  // ---------------------------------------------------------------------------

  describe('getQuota', () => {
    it('returns { postLimit } from BillingService', async () => {
      vi.mocked(mockBilling.getPostLimit).mockResolvedValue(100);

      const result = await controller.getQuota({ workspaceId: 'ws-1' });

      expect(result).toEqual({ postLimit: 100 });
      expect(mockBilling.getPostLimit).toHaveBeenCalledWith('ws-1');
    });

    it('returns free-plan default (10) when no subscription exists', async () => {
      vi.mocked(mockBilling.getPostLimit).mockResolvedValue(10);

      const result = await controller.getQuota({ workspaceId: 'ws-free' });

      expect(result).toEqual({ postLimit: 10 });
    });
  });

  // ---------------------------------------------------------------------------
  // billing.get-subscription
  // ---------------------------------------------------------------------------

  describe('getSubscription', () => {
    it('returns SubscriptionResponse when subscription exists', async () => {
      vi.mocked(mockBilling.findSubscription).mockResolvedValue(makeSubStub());

      const result = await controller.getSubscription({ workspaceId: 'ws-1' });

      expect(result).toMatchObject({
        id: 'sub-1',
        workspaceId: 'ws-1',
        status: 'active',
        plan: { code: 'pro', name: 'Pro', postLimit: 100 },
      });
      expect(result.currentPeriodStart).toBe('2026-01-01T00:00:00.000Z');
      expect(result.gracePeriodEnd).toBeNull();
    });

    it('throws RpcException with NOT_FOUND when no subscription exists', async () => {
      vi.mocked(mockBilling.findSubscription).mockResolvedValue(null);

      await expect(controller.getSubscription({ workspaceId: 'ws-none' })).rejects.toThrow(
        RpcException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // billing.checkout
  // ---------------------------------------------------------------------------

  describe('checkout', () => {
    it('returns { url } when checkout session is created successfully', async () => {
      const { ok } = await import('neverthrow');
      vi.mocked(mockBilling.createCheckoutSession).mockResolvedValue(
        ok({ url: 'https://checkout.stripe.com/pay/cs_test_123' }),
      );

      const result = await controller.checkout({ workspaceId: 'ws-1', planCode: 'pro' });

      expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_123' });
    });

    it('throws RpcException with domain error code when checkout fails', async () => {
      const { err } = await import('neverthrow');
      const { AppError } = await import('./common/app-error');
      vi.mocked(mockBilling.createCheckoutSession).mockResolvedValue(
        err(new AppError('NOT_FOUND', 'Plan not found')),
      );

      await expect(
        controller.checkout({ workspaceId: 'ws-1', planCode: 'unknown' }),
      ).rejects.toThrow(RpcException);
    });
  });

});
