import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import type { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { IPlanRepository } from './ports/plan.repository.port';
import { ISubscriptionRepository } from './ports/subscription.repository.port';
import { IBillingEventBus } from './ports/billing-event-bus.port';
import { IStripeProvider } from './ports/stripe.provider.port';
import type { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import type Stripe from 'stripe';

const mockPlans = { findByCode: vi.fn() } as unknown as IPlanRepository;
const mockSubscriptions = {
  findByWorkspaceId: vi.fn(),
  findByStripeSubscriptionId: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
} as unknown as ISubscriptionRepository;
const mockEventBus = {
  publish: vi.fn().mockResolvedValue(undefined),
} as unknown as IBillingEventBus;
const mockStripe = {
  createCheckoutSession: vi.fn(),
  verifyWebhookSignature: vi.fn(),
} as unknown as IStripeProvider;
const mockConfig = {
  get: vi.fn().mockImplementation((_key: string, fallback: unknown) => fallback),
} as unknown as ConfigService;
const mockEm = {
  flush: vi.fn().mockResolvedValue(undefined),
  persist: vi.fn(),
} as unknown as EntityManager;

const freePlan = {
  id: 'plan-free',
  code: 'free',
  stripePriceId: undefined,
  postLimit: 10,
} as unknown as Plan;
const proPlan = { id: 'plan-pro', code: 'pro', stripePriceId: 'price_pro', postLimit: 100 } as Plan;

function makeSubscription(
  status: Subscription['status'],
  plan = proPlan,
  stripeSubId?: string,
): Subscription {
  const sub = new Subscription();
  sub.workspaceId = 'ws-1';
  // Assign plan directly (not via ref()) so property access works in unit tests without ORM context.
  // In production MikroORM manages the Reference proxy transparently.
  sub.plan = plan as unknown as Subscription['plan'];
  sub.status = status;
  if (stripeSubId) sub.stripeSubscriptionId = stripeSubId;
  return sub;
}

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(() => {
    service = new BillingService(
      mockPlans,
      mockSubscriptions,
      mockEventBus,
      mockStripe,
      mockConfig,
      mockEm,
    );
    vi.clearAllMocks();
    vi.mocked(mockConfig.get).mockImplementation((_key: string, fallback: unknown) => fallback);
  });

  // ---------------------------------------------------------------------------
  // getPostLimit
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // createCheckoutSession
  // ---------------------------------------------------------------------------
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
      vi.mocked(mockStripe.createCheckoutSession).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test',
      });

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
      const existing = makeSubscription('trialing');
      vi.mocked(mockSubscriptions.findByWorkspaceId).mockResolvedValue(existing);
      vi.mocked(mockStripe.createCheckoutSession).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_existing',
      });

      const result = await service.createCheckoutSession('ws-x', 'pro');

      expect(result.isOk()).toBe(true);
      expect(mockSubscriptions.save).not.toHaveBeenCalled();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // transitionSubscription (state machine guard)
  // ---------------------------------------------------------------------------
  describe('transitionSubscription', () => {
    it('allows trialing → active and persists a billing_events row', () => {
      const sub = makeSubscription('trialing');

      const result = service.transitionSubscription(
        sub,
        'active',
        'evt_1',
        'invoice.payment_succeeded',
      );

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('active');
      expect(mockEm.persist).toHaveBeenCalledOnce();
    });

    it('allows active → grace_period and sets gracePeriodEnd', () => {
      const sub = makeSubscription('active');
      const gpe = new Date(Date.now() + 7 * 86_400_000);

      const result = service.transitionSubscription(
        sub,
        'grace_period',
        'evt_2',
        'invoice.payment_failed',
        gpe,
      );

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('grace_period');
      expect(sub.gracePeriodEnd).toBe(gpe);
    });

    it('allows grace_period → active and clears gracePeriodEnd', () => {
      const sub = makeSubscription('grace_period');
      sub.gracePeriodEnd = new Date();

      const result = service.transitionSubscription(
        sub,
        'active',
        'evt_3',
        'invoice.payment_succeeded',
      );

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('active');
      expect(sub.gracePeriodEnd).toBeUndefined();
    });

    it('returns err(INVALID_STATE_TRANSITION) for cancelled → active', () => {
      const sub = makeSubscription('cancelled');

      const result = service.transitionSubscription(
        sub,
        'active',
        'evt_4',
        'invoice.payment_succeeded',
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_STATE_TRANSITION');
      expect(mockEm.persist).not.toHaveBeenCalled();
    });

    it('returns err(INVALID_STATE_TRANSITION) for active → trialing (not in ALLOWED_TRANSITIONS)', () => {
      const sub = makeSubscription('active');

      const result = service.transitionSubscription(sub, 'trialing', 'evt_5', 'unknown');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_STATE_TRANSITION');
    });

    it('BR-F10: returns err(INVALID_STATE_TRANSITION) for free plan → grace_period', () => {
      const sub = makeSubscription('active', freePlan);

      const result = service.transitionSubscription(
        sub,
        'grace_period',
        'evt_6',
        'invoice.payment_failed',
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_STATE_TRANSITION');
      expect(result._unsafeUnwrapErr().message).toContain('Free plan');
    });

    it('BR-F10: returns err(INVALID_STATE_TRANSITION) for free plan → cancelled', () => {
      const sub = makeSubscription('active', freePlan);

      const result = service.transitionSubscription(
        sub,
        'cancelled',
        'evt_7',
        'customer.subscription.deleted',
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  // ---------------------------------------------------------------------------
  // handleStripeEvent
  // ---------------------------------------------------------------------------
  describe('handleStripeEvent', () => {
    it('invoice.payment_succeeded transitions trialing → active and publishes billing.subscription_activated', async () => {
      const sub = makeSubscription('trialing', proPlan, 'sub_test');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const event = {
        id: 'evt_paid',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            parent: { subscription_details: { subscription: 'sub_test' } },
            lines: { data: [{ period: { start: 1700000000, end: 1702592000 } }] },
          } as unknown as Stripe.Invoice,
        },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('active');
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'billing.subscription_activated',
        expect.objectContaining({ workspaceId: 'ws-1', planCode: 'pro' }),
      );
    });

    it('invoice.payment_succeeded on active subscription triggers renewal arm (publishes billing.subscription_renewed)', async () => {
      // T3.6: already-active subscriptions are renewals, not first activations.
      const sub = makeSubscription('active', proPlan, 'sub_active');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const event = {
        id: 'evt_paid2',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            parent: { subscription_details: { subscription: 'sub_active' } },
            lines: { data: [] },
          } as unknown as Stripe.Invoice,
        },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('active'); // Stays active — no state change
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'billing.subscription_renewed',
        expect.objectContaining({ workspaceId: 'ws-1', planCode: 'pro' }),
      );
    });

    it('customer.subscription.deleted transitions to cancelled and publishes billing.subscription_cancelled', async () => {
      const sub = makeSubscription('active', proPlan, 'sub_del');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const event = {
        id: 'evt_del',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_del' } as Stripe.Subscription },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('cancelled');
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'billing.subscription_cancelled',
        expect.objectContaining({ workspaceId: 'ws-1', planCode: 'pro' }),
      );
    });

    it('customer.subscription.deleted is a no-op when subscription is not found', async () => {
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(null);

      const event = {
        id: 'evt_del2',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_unknown' } as Stripe.Subscription },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('returns ok for unknown event types without side-effects', async () => {
      const event = {
        id: 'evt_unknown',
        type: 'payment_intent.created',
        data: { object: {} },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(mockEm.flush).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // T3.6: customer.subscription.updated → past_due
    // -------------------------------------------------------------------------
    it('customer.subscription.updated (past_due) transitions active → past_due and publishes billing.subscription_past_due', async () => {
      const sub = makeSubscription('active', proPlan, 'sub_upd');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const event = {
        id: 'evt_upd_past_due',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_upd', status: 'past_due' } as Stripe.Subscription },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('past_due');
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(mockEm.persist).toHaveBeenCalledOnce(); // billing_events row
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'billing.subscription_past_due',
        expect.objectContaining({ workspaceId: 'ws-1', planCode: 'pro' }),
      );
    });

    it('customer.subscription.updated (past_due) is a no-op when subscription not found', async () => {
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(null);

      const event = {
        id: 'evt_upd_nf',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_unknown', status: 'past_due' } as Stripe.Subscription },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(mockEm.flush).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('customer.subscription.updated (past_due) is a no-op when subscription is already past_due', async () => {
      const sub = makeSubscription('past_due', proPlan, 'sub_already');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const event = {
        id: 'evt_upd_idem',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_already', status: 'past_due' } as Stripe.Subscription },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(mockEm.flush).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('customer.subscription.updated with non-past_due status is a no-op', async () => {
      const event = {
        id: 'evt_upd_other',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_trial', status: 'trialing' } as Stripe.Subscription },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(mockEm.flush).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // T3.6: invoice.payment_succeeded on already-active subscription (renewal)
    // -------------------------------------------------------------------------
    it('invoice.payment_succeeded on active subscription publishes billing.subscription_renewed and logs billing_events row', async () => {
      const sub = makeSubscription('active', proPlan, 'sub_renew');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const start = 1750000000;
      const end = 1752592000;
      const event = {
        id: 'evt_renew',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            parent: { subscription_details: { subscription: 'sub_renew' } },
            lines: { data: [{ period: { start, end } }] },
          } as unknown as Stripe.Invoice,
        },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('active'); // No state change
      expect(sub.currentPeriodStart).toEqual(new Date(start * 1000));
      expect(mockEm.persist).toHaveBeenCalledOnce(); // billing_events row
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'billing.subscription_renewed',
        expect.objectContaining({ workspaceId: 'ws-1', planCode: 'pro' }),
      );
    });

    it('invoice.payment_succeeded on past_due subscription transitions past_due → active and publishes billing.subscription_activated', async () => {
      const sub = makeSubscription('past_due', proPlan, 'sub_recover');
      vi.mocked(mockSubscriptions.findByStripeSubscriptionId).mockResolvedValue(sub);

      const event = {
        id: 'evt_recover',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            parent: { subscription_details: { subscription: 'sub_recover' } },
            lines: { data: [] },
          } as unknown as Stripe.Invoice,
        },
      } as unknown as Stripe.Event;

      const result = await service.handleStripeEvent(event);

      expect(result.isOk()).toBe(true);
      expect(sub.status).toBe('active');
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'billing.subscription_activated',
        expect.objectContaining({ workspaceId: 'ws-1', planCode: 'pro' }),
      );
    });
  });
});
