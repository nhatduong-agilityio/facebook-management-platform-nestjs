import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { AppError } from '../../common/errors/app-error';
import { toHttpException } from '../../common/http/to-http-exception';
import { DownstreamServiceError } from '../../common/errors/downstream-service.error';
import type { CheckoutResponse } from '@fcp/billing-contracts';
import { IBillingHttpClient } from './ports/billing-http.client.port';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';

/** Maps a billing downstream error to a clean `AppError`. */
function mapBillingError(e: unknown): AppError {
  if (e instanceof DownstreamServiceError) {
    if (e.status === 404) return AppError.notFound('Subscription');
    return e.status >= 500
      ? AppError.serviceUnavailable('Billing service')
      : AppError.internal(`Billing service responded with unexpected ${e.status}`);
  }
  return AppError.internal('Unexpected error from billing service');
}

/**
 * Proxy billing endpoints for `apps/api` under `/workspaces/:workspaceId/billing`.
 *
 * All business logic lives in `services/billing`. This controller validates auth,
 * enforces workspace role guards, and forwards requests to the billing service via HTTP.
 *
 * All routes require a valid Clerk JWT and an Owner or Editor role on the workspace.
 */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, WorkspaceRolesGuard)
@Roles('owner', 'editor')
@Controller('workspaces/:workspaceId/billing')
export class BillingController {
  constructor(private readonly billingClient: IBillingHttpClient) {}

  /**
   * Returns the current subscription for a workspace, including plan details.
   *
   * Proxies to `services/billing GET /workspaces/:id/subscription`.
   * Stripe customer/subscription IDs are never exposed.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns `SubscriptionResponseDto` with status, plan, and billing period.
   */
  @Get('subscription')
  @ApiOperation({ summary: 'Get current subscription for a workspace' })
  @ApiOkResponse({ type: SubscriptionResponseDto, description: 'Current subscription with plan metadata.' })
  @ApiNotFoundResponse({ description: 'No subscription exists for this workspace yet.' })
  @ApiForbiddenResponse({ description: 'Missing role or unauthorized workspace.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiServiceUnavailableResponse({ description: 'Billing service is unreachable.' })
  async getSubscription(
    @Param('workspaceId') workspaceId: string,
  ): Promise<SubscriptionResponseDto> {
    try {
      return await this.billingClient.getSubscription(workspaceId);
    } catch (e) {
      throw toHttpException(mapBillingError(e));
    }
  }

  /**
   * Creates a Stripe Checkout session for the selected plan.
   *
   * Proxies to `services/billing POST /checkout`. Returns the Stripe-hosted
   * Checkout URL the client must redirect the user to.
   *
   * @param workspaceId - UUID of the workspace initiating checkout.
   * @param dto         - `{ planCode }` — must be `pro` or `team`.
   * @returns `{ url }` — Stripe Checkout URL.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Stripe Checkout session for a plan upgrade' })
  @ApiCreatedResponse({ description: 'Returns the Stripe Checkout URL.' })
  @ApiForbiddenResponse({ description: 'Missing role or unauthorized workspace.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  async createCheckout(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResponse> {
    try {
      return await this.billingClient.createCheckoutSession({
        planCode: dto.planCode,
        workspaceId,
      });
    } catch (err) {
      throw toHttpException(
        new AppError('INTERNAL', err instanceof Error ? err.message : 'Billing service unavailable'),
      );
    }
  }
}
