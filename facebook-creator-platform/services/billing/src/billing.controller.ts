import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
}
