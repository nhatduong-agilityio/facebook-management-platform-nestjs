import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { toHttpException } from '../../common/http/to-http-exception';
import { FacebookService } from './facebook.service';

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
 * Register `http://localhost:3000/api/v1/webhooks/facebook` as the Callback URL
 * in the Facebook App Dashboard → Webhooks, and set a matching `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
 */
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
