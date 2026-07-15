import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { unref } from '@mikro-orm/core';
import type { SubscriptionResponse } from '@fcp/billing-contracts';
import { toHttpException } from './common/to-http-exception';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/**
 * Internal HTTP endpoints for `services/billing`.
 *
 * These routes are called **only** by `apps/api` (not exposed to end users directly).
 * Auth and workspace ownership are enforced in `apps/api` before the proxy call reaches here.
 * No Clerk JWT guard is applied — this service is on a private internal network.
 */
@ApiTags('billing-internal')
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Creates a Stripe Checkout session.
   *
   * Called by `apps/api POST /workspaces/:id/billing/checkout` after auth/role validation.
   *
   * @param dto - `{ planCode, workspaceId }`.
   * @returns `{ url }` — Stripe-hosted Checkout URL.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Stripe Checkout session (internal)' })
  @ApiCreatedResponse({ description: 'Returns the Stripe Checkout URL.' })
  @ApiNotFoundResponse({ description: 'Plan code not found.' })
  async createCheckout(@Body() dto: CreateCheckoutDto): Promise<{ url: string }> {
    const result = await this.billingService.createCheckoutSession(dto.workspaceId, dto.planCode);
    return result.match(
      (data) => data,
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Returns the post limit for a workspace's current plan.
   *
   * Called by `apps/api` `IPostQuotaProvider` before creating a post.
   * Returns the free-plan default (10) when no subscription exists.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns `{ postLimit }` — maximum non-deleted posts allowed.
   */
  @Get('workspaces/:workspaceId/quota')
  @ApiOperation({ summary: 'Get post quota for a workspace (internal)' })
  @ApiOkResponse({ description: 'Returns { postLimit }.' })
  async getQuota(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ postLimit: number }> {
    const postLimit = await this.billingService.getPostLimit(workspaceId);
    return { postLimit };
  }

  /**
   * Returns the current subscription for a workspace.
   *
   * Called by `apps/api GET /workspaces/:id/subscription` after auth/role validation.
   * Stripe customer/subscription IDs are **never** included in the response.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns `SubscriptionResponse` wire shape.
   * @throws 404 when the workspace has no subscription record.
   */
  @Get('workspaces/:workspaceId/subscription')
  @ApiOperation({ summary: 'Get current subscription for a workspace (internal)' })
  @ApiOkResponse({ description: 'Returns SubscriptionResponse.' })
  @ApiNotFoundResponse({ description: 'No subscription exists for this workspace.' })
  async getSubscription(
    @Param('workspaceId') workspaceId: string,
  ): Promise<SubscriptionResponse> {
    const sub = await this.billingService.findSubscription(workspaceId);
    if (!sub) throw new NotFoundException(`No subscription found for workspace ${workspaceId}`);
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
}
