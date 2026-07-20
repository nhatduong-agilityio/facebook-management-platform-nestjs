import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { unref } from '@mikro-orm/core';
import type { SubscriptionResponse } from '@fcp/billing-contracts';
import { BillingService } from './billing.service';

/**
 * TCP RPC handlers for synchronous queries from `apps/api` (ADR-094).
 *
 * All handlers follow the §15 pattern:
 * - `ok` path returns a plain serialisable object.
 * - `err` / not-found path throws `RpcException({ code, message })` so the
 *   caller's TCP adapter can map it back to `AppError` without parsing strings.
 *
 * This controller is **not** an HTTP controller — `@Body()`, `@Param()`, and
 * HTTP decorators are not used here.
 */
@Controller()
export class BillingMessageController {
  constructor(private readonly billing: BillingService) {}

  /**
   * Returns the post-creation quota limit for a workspace's current plan.
   *
   * Pattern: `billing.get-quota`
   * Payload: `{ workspaceId: string }`
   * Response: `{ postLimit: number }`
   *
   * @param dto - RPC payload containing the workspace UUID.
   */
  @MessagePattern('billing.get-quota')
  async getQuota(@Payload() dto: { workspaceId: string }): Promise<{ postLimit: number }> {
    const postLimit = await this.billing.getPostLimit(dto.workspaceId);
    return { postLimit };
  }

  /**
   * Returns the current subscription for a workspace.
   *
   * Pattern: `billing.get-subscription`
   * Payload: `{ workspaceId: string }`
   * Response: `SubscriptionResponse`
   *
   * @param dto - RPC payload containing the workspace UUID.
   * @throws {RpcException} with `code: 'NOT_FOUND'` when no subscription exists.
   */
  @MessagePattern('billing.get-subscription')
  async getSubscription(@Payload() dto: { workspaceId: string }): Promise<SubscriptionResponse> {
    const sub = await this.billing.findSubscription(dto.workspaceId);
    if (!sub) {
      throw new RpcException({ code: 'NOT_FOUND', message: `No subscription found for workspace ${dto.workspaceId}` });
    }
    const plan = unref(sub.plan);
    return {
      id: sub.id,
      workspaceId: sub.workspaceId,
      status: sub.status,
      plan: { code: plan.code, name: plan.name, postLimit: plan.postLimit },
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      gracePeriodEnd: sub.gracePeriodEnd?.toISOString() ?? null,
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
    };
  }

  /**
   * Creates a Stripe Checkout session for a workspace.
   *
   * Pattern: `billing.checkout`
   * Payload: `{ workspaceId: string; planCode: string }`
   * Response: `{ url: string }`
   *
   * @param dto - RPC payload with workspace UUID and plan code.
   * @throws {RpcException} with the domain error `code` and `message` on failure.
   */
  @MessagePattern('billing.checkout')
  async checkout(
    @Payload() dto: { workspaceId: string; planCode: string },
  ): Promise<{ url: string }> {
    const result = await this.billing.createCheckoutSession(dto.workspaceId, dto.planCode);
    return result.match(
      (data) => data,
      (e) => { throw new RpcException({ code: e.code, message: e.message }); },
    );
  }

}
