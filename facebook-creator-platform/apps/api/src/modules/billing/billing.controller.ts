import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { AppError } from '../../common/errors/app-error';
import { toHttpException } from '../../common/http/to-http-exception';
import type { CheckoutResponse } from '@fcp/billing-contracts';
import { IBillingHttpClient } from './ports/billing-http.client.port';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

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
