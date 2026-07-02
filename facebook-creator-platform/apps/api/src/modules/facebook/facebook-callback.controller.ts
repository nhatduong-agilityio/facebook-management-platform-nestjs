import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { toHttpException } from '../../common/http/to-http-exception';
import { FacebookService } from './facebook.service';
import { ConnectedPageResponseDto } from './dto/connect-page.dto';

/**
 * Handles the Facebook OAuth redirect callback.
 *
 * This controller is intentionally **not** behind `ClerkAuthGuard` or
 * `WorkspaceRolesGuard`. The redirect comes from Facebook's servers via a
 * browser redirect — there is no Clerk JWT on the request. Security is
 * provided entirely by the CSRF state HMAC: the backend signed the state
 * with `FACEBOOK_APP_SECRET` when the connect-url was issued, so only a
 * valid, unmodified state can successfully exchange a code.
 *
 * Set `FACEBOOK_REDIRECT_URI=http://localhost:3000/api/v1/facebook/callback`
 * in your Facebook App Dashboard (Valid OAuth Redirect URIs).
 */
@ApiTags('facebook')
@Controller('facebook')
export class FacebookCallbackController {
  constructor(private readonly facebookService: FacebookService) {}

  /**
   * Receives the Facebook OAuth redirect, exchanges the code for page access
   * tokens, and persists connected Pages for the workspace encoded in the state.
   *
   * Facebook redirects here after the user grants (or denies) permission.
   * The `workspaceId` is extracted from the signed `state` token — no URL
   * parameter is needed. The HMAC is re-verified inside `connectPage`.
   *
   * @param code  - Authorization code issued by Facebook.
   * @param state - CSRF state token originally issued by `GET /connect-url`.
   */
  @Get('callback')
  @ApiOperation({ summary: 'Facebook OAuth redirect callback (no auth guard — HMAC-secured)' })
  @ApiQuery({ name: 'code', description: 'Authorization code from Facebook' })
  @ApiQuery({ name: 'state', description: 'CSRF state token from the original connect-url' })
  @ApiOkResponse({ type: [ConnectedPageResponseDto], description: 'Pages connected (tokens not included)' })
  @ApiBadRequestResponse({ description: 'Missing code or state, or structurally invalid state' })
  @ApiForbiddenResponse({ description: 'HMAC mismatch or workspaceId mismatch (BR-R05)' })
  @ApiNotFoundResponse({ description: 'User manages no Facebook Pages' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<ConnectedPageResponseDto[]> {
    if (!code || !state) {
      throw new BadRequestException('Missing required query parameters: code, state');
    }

    const result = await this.facebookService.handleCallback(code, state);
    return result.match(
      (pages) => pages,
      (e) => { throw toHttpException(e); },
    );
  }
}
