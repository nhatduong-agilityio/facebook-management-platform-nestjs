import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { toHttpException } from './common/to-http-exception';
import { BillingService } from './billing.service';
import { IBillingEventRepository } from './ports/billing-event.repository.port';
import { IStripeProvider } from './ports/stripe.provider.port';

/**
 * Receives and processes Stripe webhook events for `services/billing`.
 *
 * Security contract:
 * - `Stripe-Signature` is verified **before** any payload processing.
 * - Raw body is used for signature verification (`rawBody: true` in `NestFactory.create`).
 * - Idempotency: `stripe_event_id` is checked in `billing_events` before processing;
 *   duplicate deliveries return 200 without re-applying state transitions (BR-R04).
 * - No Clerk JWT guard — this endpoint is called by Stripe, not by our clients.
 *
 * Stripe requires a 200 response within 30 s; any non-2xx triggers a retry.
 */
@ApiExcludeController()
@Controller('webhooks')
export class BillingWebhookController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingEvents: IBillingEventRepository,
    private readonly stripe: IStripeProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Handles incoming Stripe webhook deliveries.
   *
   * Flow:
   * 1. Read raw body and `Stripe-Signature` header.
   * 2. Verify signature with `STRIPE_WEBHOOK_SECRET` → 400 on failure.
   * 3. Check `billing_events` for `stripe_event_id` → 200 if already processed (idempotent).
   * 4. Route to `BillingService.handleStripeEvent`.
   * 5. Return 200 (Stripe retries on any non-2xx).
   *
   * @param req        - Express request; `req.rawBody` is populated by `rawBody: true`.
   * @param sigHeader  - Value of the `Stripe-Signature` header.
   * @returns Empty 200 response on success.
   */
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sigHeader: string,
  ): Promise<void> {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException('Missing raw body — ensure rawBody: true in NestFactory.create');
    }

    if (!sigHeader) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    let event;
    try {
      event = this.stripe.verifyWebhookSignature(rawBody, sigHeader, secret);
    } catch {
      // Signature mismatch — do not log the signature value (security)
      throw new BadRequestException('Invalid Stripe-Signature');
    }

    // Idempotency check — if this stripe_event_id already exists, return 200 silently.
    const existing = await this.billingEvents.findByStripeEventId(event.id);
    if (existing) return;

    const result = await this.billingService.handleStripeEvent(event);
    if (result.isErr()) {
      throw toHttpException(result.error);
    }
  }
}
