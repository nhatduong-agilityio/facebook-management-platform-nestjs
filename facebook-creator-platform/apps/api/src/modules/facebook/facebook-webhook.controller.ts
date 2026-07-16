import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { toHttpException } from '../../common/http/to-http-exception';
import { FacebookService, type FacebookWebhookPayload } from './facebook.service';

/**
 * Handles Facebook webhook lifecycle requests.
 *
 * This controller is **not** behind any auth guard. Facebook's servers call
 * these endpoints directly; security is enforced by:
 * - `GET` (challenge): `hub.verify_token` compared timing-safely against
 *   `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (§14 — read once in the adapter constructor).
 * - `POST` (events, T2.7): `X-Hub-Signature-256` HMAC-SHA256 verified with
 *   `FACEBOOK_APP_SECRET` before any payload is processed.
 *
 * `@SkipThrottle()` — Facebook's delivery IPs span a large CIDR range and may
 * change; IP-based throttling would block legitimate retries. HMAC verification
 * is the authentication mechanism here.
 *
 * Register `http://localhost:3000/api/v1/webhooks/facebook` as the Callback URL
 * in the Facebook App Dashboard → Webhooks, and set a matching `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
 */
@SkipThrottle()
@ApiTags('facebook')
@Controller('webhooks/facebook')
export class FacebookWebhookController {
  constructor(private readonly facebookService: FacebookService) {}

  /**
   * Facebook webhook hub.challenge verification endpoint.
   *
   * Facebook sends this request when the webhook URL is first registered or
   * re-verified. Responds with the raw `hub.challenge` string when the
   * `hub.verify_token` matches `FACEBOOK_WEBHOOK_VERIFY_TOKEN`; returns 403
   * otherwise.
   *
   * @param mode        - `hub.mode` query parameter; must be `"subscribe"`.
   * @param verifyToken - `hub.verify_token`; must match `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
   * @param challenge   - `hub.challenge`; echoed back on success.
   */
  /**
   * Receives Facebook webhook event notifications.
   *
   * Facebook sends `POST /webhooks/facebook` with a JSON payload signed via
   * `X-Hub-Signature-256: sha256=<HMAC-SHA256(FACEBOOK_APP_SECRET, rawBody)>`.
   * The signature is verified before any payload is processed; an invalid
   * signature returns 403 immediately.
   *
   * Recognized events dispatched as domain events to `fcp.events`:
   * - `pages/feed` (verb=add) → `facebook.feed` → `FacebookFeedConsumer` drives `publishing→published`
   * - `page` deauthorize     → `facebook.page.deauthorized` → `FacebookPageDeauthorizedConsumer`
   *
   * Facebook requires a 200 response within 20 seconds; async consumers process
   * after this handler returns.
   *
   * @param sigHeader - `X-Hub-Signature-256` header value from Facebook.
   * @param req       - Express request with `rawBody` buffer (requires `rawBody: true` in bootstrap).
   * @param payload   - Parsed webhook JSON body.
   */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive Facebook webhook event notifications' })
  @ApiOkResponse({ description: 'Event acknowledged; async processing via RabbitMQ consumers' })
  @ApiForbiddenResponse({ description: 'X-Hub-Signature-256 is missing or does not match' })
  async handleWebhookEvent(
    @Headers('x-hub-signature-256') sigHeader: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: FacebookWebhookPayload,
  ): Promise<void> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const result = await this.facebookService.processWebhookPayload(rawBody, sigHeader ?? '', payload);
    result.match(
      () => undefined,
      (e) => { throw toHttpException(e); },
    );
  }

  @Get()
  @ApiOperation({ summary: 'Facebook webhook hub.challenge verification' })
  @ApiQuery({ name: 'hub.mode', description: 'Must be "subscribe"' })
  @ApiQuery({ name: 'hub.verify_token', description: 'Must match FACEBOOK_WEBHOOK_VERIFY_TOKEN' })
  @ApiQuery({ name: 'hub.challenge', description: 'Opaque nonce echoed back to Facebook' })
  @ApiOkResponse({ description: 'hub.challenge echoed back as plain text' })
  @ApiForbiddenResponse({ description: 'hub.mode is not "subscribe" or verify_token mismatch' })
  verifyChallenge(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.facebookService.verifyWebhookChallenge(mode, verifyToken, challenge);
    return result.match(
      (ch) => ch,
      (e) => { throw toHttpException(e); },
    );
  }
}
