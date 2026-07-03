import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, unref } from '@mikro-orm/core';
import { Result, ok, err } from 'neverthrow';
import type Stripe from 'stripe';
import { uuidv7 } from 'uuidv7';
import type {
  SubscriptionActivatedPayload,
  SubscriptionCancelledPayload,
} from '@fcp/billing-contracts';
import { AppError } from './common/app-error';
import { IPlanRepository } from './ports/plan.repository.port';
import { ISubscriptionRepository } from './ports/subscription.repository.port';
import { IBillingEventBus } from './ports/billing-event-bus.port';
import { IStripeProvider } from './ports/stripe.provider.port';
import { Subscription, type SubscriptionStatus } from './entities/subscription.entity';
import { BillingEvent } from './entities/billing-event.entity';

/**
 * Allowed state transitions for the billing subscription state machine (§7).
 *
 * Terminal state `cancelled` has no outbound transitions.
 * Free-plan guard (BR-F10) further restricts transitions for plan.code === 'free'.
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ['active', 'grace_period', 'cancelled'],
  active: ['grace_period', 'cancelled'],
  grace_period: ['active', 'cancelled'],
  cancelled: [],
};

/**
 * Grace period duration in days applied when a payment fails (BR-F07).
 * Stripe typically sets this on the subscription, but we apply a default here
 * for the billing_events log; the actual `grace_period_end` comes from Stripe.
 */
const GRACE_PERIOD_DAYS = 7;

/**
 * Core billing domain service.
 *
 * Owns plan lookup, subscription provisioning, Stripe Checkout creation, and the
 * subscription state machine. All mutating methods return `Result<T, AppError>` —
 * never throw for domain errors.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly plans: IPlanRepository,
    private readonly subscriptions: ISubscriptionRepository,
    private readonly eventBus: IBillingEventBus,
    private readonly stripe: IStripeProvider,
    private readonly config: ConfigService,
    private readonly em: EntityManager,
  ) {}

  /**
   * Returns the maximum post count allowed by the workspace's current plan.
   *
   * Falls back to the free-plan default (10) when no subscription exists yet.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns The post limit for the workspace's plan.
   */
  async getPostLimit(workspaceId: string): Promise<number> {
    const sub = await this.subscriptions.findByWorkspaceId(workspaceId);
    return sub ? unref(sub.plan).postLimit : 10;
  }

  /**
   * Creates a Stripe Checkout session for the given workspace and plan.
   *
   * Flow:
   * 1. Resolve plan by `planCode` → `err(NOT_FOUND)` if unknown.
   * 2. Reject free plan (no `stripePriceId`) → `err(VALIDATION_ERROR)`.
   * 3. Find or create a `trialing` subscription for the workspace.
   * 4. Call Stripe to create a hosted Checkout session.
   * 5. Persist the new subscription (if created) via `em.flush()`.
   *
   * @param workspaceId - UUID of the workspace initiating checkout.
   * @param planCode    - Plan code to subscribe to (`pro` or `team`).
   * @returns ok({ url }) on success, or err(AppError) for domain failures.
   */
  async createCheckoutSession(
    workspaceId: string,
    planCode: string,
  ): Promise<Result<{ url: string }, AppError>> {
    const plan = await this.plans.findByCode(planCode);
    if (!plan) {
      return err(AppError.notFound('Plan', { planCode }));
    }

    if (!plan.stripePriceId) {
      return err(
        new AppError('VALIDATION_ERROR', 'The free plan does not have a Stripe checkout flow'),
      );
    }

    let subscription = await this.subscriptions.findByWorkspaceId(workspaceId);
    const isNew = !subscription;

    if (!subscription) {
      subscription = Subscription.create(workspaceId, plan);
    }

    const successUrl = this.config.get<string>(
      'BILLING_SUCCESS_URL',
      'http://localhost:3000/billing/success',
    );
    const cancelUrl = this.config.get<string>(
      'BILLING_CANCEL_URL',
      'http://localhost:3000/billing/cancel',
    );

    const { url } = await this.stripe.createCheckoutSession({
      priceId: plan.stripePriceId,
      workspaceId,
      successUrl,
      cancelUrl,
    });

    if (isNew) {
      await this.subscriptions.save(subscription);
      await this.em.flush();
    }

    return ok({ url });
  }

  /**
   * Applies a guarded state transition on a subscription, persisting a `billing_events`
   * row in the same Unit-of-Work. Caller must call `em.flush()` after this returns.
   *
   * Guards:
   * - Transition must be in `ALLOWED_TRANSITIONS[currentStatus]` → `err(INVALID_STATE_TRANSITION)`.
   * - Free-plan guard (BR-F10): free plan cannot enter `grace_period` or `cancelled`.
   *
   * @param sub          - The subscription to transition (must be tracked by the EM).
   * @param newStatus    - The target status.
   * @param stripeEventId - Stripe event ID for the `billing_events` log.
   * @param stripeEventType - Stripe event type string.
   * @param gracePeriodEnd  - Required when transitioning to `grace_period` (BR-F07).
   * @returns ok(sub) after applying the transition, or err(AppError) on guard failure.
   */
  transitionSubscription(
    sub: Subscription,
    newStatus: SubscriptionStatus,
    stripeEventId: string,
    stripeEventType: string,
    gracePeriodEnd?: Date,
  ): Result<Subscription, AppError> {
    const allowed = ALLOWED_TRANSITIONS[sub.status];
    if (!allowed.includes(newStatus)) {
      return err(
        new AppError(
          'INVALID_STATE_TRANSITION',
          `Cannot transition from ${sub.status} to ${newStatus}`,
          {
            from: sub.status,
            to: newStatus,
          },
        ),
      );
    }

    // BR-F10: free plan may only be trialing or active
    const planCode = unref(sub.plan).code;
    if (planCode === 'free' && (newStatus === 'grace_period' || newStatus === 'cancelled')) {
      return err(
        new AppError(
          'INVALID_STATE_TRANSITION',
          'Free plan cannot enter grace_period or cancelled',
          {
            planCode,
            to: newStatus,
          },
        ),
      );
    }

    const fromStatus = sub.status;
    sub.status = newStatus;

    if (newStatus === 'grace_period') {
      sub.gracePeriodEnd = gracePeriodEnd ?? new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000);
    } else {
      sub.gracePeriodEnd = undefined;
    }

    const billingEvent = BillingEvent.create(
      stripeEventId,
      stripeEventType,
      { fromStatus, toStatus: newStatus, workspaceId: sub.workspaceId, planCode },
      new Date(),
      sub,
    );
    this.em.persist(billingEvent);

    return ok(sub);
  }

  /**
   * Routes an incoming Stripe webhook event to the appropriate handler.
   *
   * Idempotency is checked by the caller (webhook controller) before calling this method.
   * Each handler applies the state transition, persists, flushes, and publishes.
   *
   * @param event - A verified `Stripe.Event` object.
   * @returns ok(void) on success, or err(AppError) for domain failures.
   */
  async handleStripeEvent(event: Stripe.Event): Promise<Result<void, AppError>> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(event);
      case 'invoice.payment_succeeded':
        return this.handleInvoicePaymentSucceeded(event);
      case 'invoice.payment_failed':
        return this.handleInvoicePaymentFailed(event);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event);
      default:
        // Unknown event type — not an error; we just don't act on it.
        return ok(undefined);
    }
  }

  /**
   * Handles `checkout.session.completed` — stores Stripe customer and subscription IDs.
   *
   * Does not change subscription status; `invoice.payment_succeeded` drives the
   * `trialing → active` transition after the first invoice is paid.
   *
   * @param event - Verified Stripe event of type `checkout.session.completed`.
   * @returns ok(void) on success, or err(NOT_FOUND) if the workspace has no subscription.
   */
  private async handleCheckoutCompleted(event: Stripe.Event): Promise<Result<void, AppError>> {
    const session = event.data.object as Stripe.Checkout.Session;
    const workspaceId = session.metadata?.workspaceId;

    if (!workspaceId) {
      // No workspaceId in metadata — session not created by this service; skip.
      return ok(undefined);
    }

    const sub = await this.subscriptions.findByWorkspaceId(workspaceId);
    if (!sub) {
      return err(AppError.notFound('Subscription', { workspaceId }));
    }

    if (typeof session.customer === 'string') {
      sub.stripeCustomerId = session.customer;
    }
    if (typeof session.subscription === 'string') {
      sub.stripeSubscriptionId = session.subscription;
    }

    // Persist the updated IDs without a status transition; flush here (no billing_events row needed).
    await this.em.flush();
    return ok(undefined);
  }

  /**
   * Handles `invoice.payment_succeeded` — transitions `trialing` or `grace_period` to `active`.
   *
   * Publishes `billing.subscription_activated` after commit.
   *
   * @param event - Verified Stripe event of type `invoice.payment_succeeded`.
   * @returns ok(void) on success, or err(AppError) for domain failures.
   */
  private async handleInvoicePaymentSucceeded(
    event: Stripe.Event,
  ): Promise<Result<void, AppError>> {
    const invoice = event.data.object as Stripe.Invoice;
    // Stripe SDK v22: subscription ID lives at parent.subscription_details.subscription
    const parentSub = invoice.parent?.subscription_details?.subscription;
    const stripeSubId = typeof parentSub === 'string' ? parentSub : null;

    if (!stripeSubId) return ok(undefined);

    const sub = await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
    if (!sub) return ok(undefined); // sub may not exist yet if checkout.session.completed hasn't fired

    // Update billing period from the invoice lines
    const period = invoice.lines?.data[0]?.period;
    if (period) {
      sub.currentPeriodStart = new Date(period.start * 1000);
      sub.currentPeriodEnd = new Date(period.end * 1000);
    }

    if (sub.status !== 'trialing' && sub.status !== 'grace_period') {
      return ok(undefined); // Already active or cancelled — nothing to do.
    }

    const transResult = this.transitionSubscription(sub, 'active', event.id, event.type);
    if (transResult.isErr()) return err(transResult.error);

    await this.em.flush();

    const planCode = unref(sub.plan).code;
    const payload: SubscriptionActivatedPayload = {
      eventId: uuidv7(),
      workspaceId: sub.workspaceId,
      planCode,
      occurredAt: new Date().toISOString(),
    };
    await this.eventBus.publish(
      'billing.subscription_activated',
      payload as unknown as Record<string, unknown>,
    );

    return ok(undefined);
  }

  /**
   * Handles `invoice.payment_failed` — transitions `active` to `grace_period`.
   *
   * Sets `gracePeriodEnd` from the invoice's `next_payment_attempt` timestamp,
   * falling back to `now() + 7 days` (BR-F07).
   *
   * @param event - Verified Stripe event of type `invoice.payment_failed`.
   * @returns ok(void) on success, or err(AppError) for domain failures.
   */
  private async handleInvoicePaymentFailed(event: Stripe.Event): Promise<Result<void, AppError>> {
    const invoice = event.data.object as Stripe.Invoice;
    // Stripe SDK v22: subscription ID lives at parent.subscription_details.subscription
    const parentSub = invoice.parent?.subscription_details?.subscription;
    const stripeSubId = typeof parentSub === 'string' ? parentSub : null;

    if (!stripeSubId) return ok(undefined);

    const sub = await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
    if (!sub) return ok(undefined);

    if (sub.status !== 'active') return ok(undefined);

    const gracePeriodEnd = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000)
      : new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000);

    const transResult = this.transitionSubscription(
      sub,
      'grace_period',
      event.id,
      event.type,
      gracePeriodEnd,
    );
    if (transResult.isErr()) return err(transResult.error);

    await this.em.flush();
    return ok(undefined);
  }

  /**
   * Handles `customer.subscription.deleted` — transitions the subscription to `cancelled`.
   *
   * Publishes `billing.subscription_cancelled` after commit.
   *
   * @param event - Verified Stripe event of type `customer.subscription.deleted`.
   * @returns ok(void) on success, or err(AppError) for domain failures.
   */
  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<Result<void, AppError>> {
    const stripeSub = event.data.object as Stripe.Subscription;
    const stripeSubId = stripeSub.id;

    const sub = await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
    if (!sub) return ok(undefined);

    if (sub.status === 'cancelled') return ok(undefined);

    const transResult = this.transitionSubscription(sub, 'cancelled', event.id, event.type);
    if (transResult.isErr()) return err(transResult.error);

    await this.em.flush();

    const planCode = unref(sub.plan).code;
    const payload: SubscriptionCancelledPayload = {
      eventId: uuidv7(),
      workspaceId: sub.workspaceId,
      planCode,
      occurredAt: new Date().toISOString(),
    };
    await this.eventBus.publish(
      'billing.subscription_cancelled',
      payload as unknown as Record<string, unknown>,
    );

    return ok(undefined);
  }
}
