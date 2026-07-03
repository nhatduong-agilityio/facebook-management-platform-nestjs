import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import type { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { IPlanRepository } from './ports/plan.repository.port';
import { ISubscriptionRepository } from './ports/subscription.repository.port';
import { IStripeProvider } from './ports/stripe.provider.port';
import type { Plan } from './entities/plan.entity';
import type { Subscription } from './entities/subscription.entity';

const mockPlans = { findByCode: vi.fn() } as unknown as IPlanRepository;
const mockSubscriptions = {
  findByWorkspaceId: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
} as unknown as ISubscriptionRepository;
const mockStripe = {
  createCheckoutSession: vi.fn<Parameters<IStripeProvider['createCheckoutSession']>>(),
} as unknown as IStripeProvider;
const mockConfig = {
  get: vi.fn().mockImplementation((_key: string, fallback: string) => fallback),
} as unknown as ConfigService;
const mockEm = { flush: vi.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

const freePlan = { id: 'plan-free', code: 'free', stripePriceId: undefined, postLimit: 10 } as unknown as Plan;
const proPlan  = { id: 'plan-pro',  code: 'pro',  stripePriceId: 'price_pro', postLimit: 100 } as Plan;

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(() => {
    service = new BillingService(mockPlans, mockSubscriptions, mockStripe, mockConfig, mockEm);
    vi.clearAllMocks();
    vi.mocked(mockConfig.get).mockImplementation((_key: string, fallback: string) => fallback);
  });

  describe('getPostLimit', () => {
    it('returns plan.postLimit when a subscription exists', async () => {
      const sub = { plan: { postLimit: 100 } } as unknown as Subscription;
      vi.mocked(mockSubscriptions.findByWorkspaceId).mockResolvedValue(sub);

      expect(await service.getPostLimit('ws-1')).toBe(100);
    });

    it('returns 10 (free-plan default) when no subscription exists', async () => {
      vi.mocked(mockSubscriptions.findByWorkspaceId).mockResolvedValue(null);

      expect(await service.getPostLimit('ws-new')).toBe(10);
    });
  });

  describe('createCheckoutSession', () => {
    it('returns err(NOT_FOUND) when the plan code does not exist', async () => {
      vi.mocked(mockPlans.findByCode).mockResolvedValue(null);

      const result = await service.createCheckoutSession('ws-1', 'enterprise');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
      expect(mockStripe.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('returns err(VALIDATION_ERROR) when the plan has no Stripe price (free plan)', async () => {
      vi.mocked(mockPlans.findByCode).mockResolvedValue(freePlan);

      const result = await service.createCheckoutSession('ws-1', 'free');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
      expect(mockStripe.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates a new trialing subscription and returns the checkout URL when none exists', async () => {
      vi.mocked(mockPlans.findByCode).mockResolvedValue(proPlan);
      vi.mocked(mockSubscriptions.findByWorkspaceId).mockResolvedValue(null);
      vi.mocked(mockStripe.createCheckoutSession).mockResolvedValue({ url: 'https://checkout.stripe.com/cs_test' });

      const result = await service.createCheckoutSession('ws-new', 'pro');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ url: 'https://checkout.stripe.com/cs_test' });
      expect(mockSubscriptions.save).toHaveBeenCalledOnce();
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(mockStripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ priceId: 'price_pro', workspaceId: 'ws-new' }),
      );
    });

    it('reuses an existing subscription and does not flush when one already exists', async () => {
      vi.mocked(mockPlans.findByCode).mockResolvedValue(proPlan);
      const existing = { id: 'sub-1', workspaceId: 'ws-x', status: 'trialing' } as unknown as Subscription;
      vi.mocked(mockSubscriptions.findByWorkspaceId).mockResolvedValue(existing);
      vi.mocked(mockStripe.createCheckoutSession).mockResolvedValue({ url: 'https://checkout.stripe.com/cs_existing' });

      const result = await service.createCheckoutSession('ws-x', 'pro');

      expect(result.isOk()).toBe(true);
      expect(mockSubscriptions.save).not.toHaveBeenCalled();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });
});
