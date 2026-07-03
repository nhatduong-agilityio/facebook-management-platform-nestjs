import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { Result, ok, err } from 'neverthrow';
import { AppError } from './common/app-error';
import { IPlanRepository } from './ports/plan.repository.port';
import { ISubscriptionRepository } from './ports/subscription.repository.port';
import { IStripeProvider } from './ports/stripe.provider.port';
import { Subscription } from './entities/subscription.entity';

/**
 * Core billing domain service.
 *
 * Owns plan lookup, subscription provisioning, and Stripe Checkout creation.
 * All mutating methods return `Result<T, AppError>` — never throw for domain errors.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly plans: IPlanRepository,
    private readonly subscriptions: ISubscriptionRepository,
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
    return sub?.plan.postLimit ?? 10;
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
}
