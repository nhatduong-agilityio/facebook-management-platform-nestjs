import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ClerkWebhookService, type ClerkWebhookHeaders } from './clerk-webhook.service';

/**
 * Receives Clerk user lifecycle webhook events and delegates signature
 * verification + persistence to `ClerkWebhookService`.
 *
 * Register this endpoint URL in the Clerk Dashboard → Webhooks section.
 * Subscribe to: `user.created`, `user.updated`, `user.deleted`.
 *
 * The route is intentionally unprotected (no `ClerkAuthGuard`) — Clerk
 * authenticates via a Standard Webhooks HMAC signature, not a Bearer JWT.
 *
 * `@SkipThrottle()` — Clerk's delivery IPs are not fixed; IP-based throttling
 * would block legitimate retries. Svix HMAC verification is the auth mechanism.
 */
@SkipThrottle()
@ApiTags('webhooks')
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private readonly clerkWebhookService: ClerkWebhookService) {}

  /**
   * Processes a Clerk webhook event.
   *
   * Requires `rawBody: true` in `NestFactory.create` so the raw body buffer is
   * preserved before the JSON body parser consumes it. Signature
   * verification reads the raw bytes — a re-serialized JSON object fails the HMAC check.
   *
   * @param req - Express request carrying `req.rawBody` (Buffer).
   * @param svixId - `svix-id` header forwarded by Clerk.
   * @param svixTimestamp - `svix-timestamp` header forwarded by Clerk.
   * @param svixSignature - `svix-signature` header forwarded by Clerk.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clerk user lifecycle webhook receiver (user.created / updated / deleted)' })
  async handleClerkWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ): Promise<void> {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body is required for webhook signature verification');
    }
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing required webhook signature headers');
    }

    const webhookHeaders: ClerkWebhookHeaders = {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    };

    await this.clerkWebhookService.handleEvent(req.rawBody, webhookHeaders);
  }
}
