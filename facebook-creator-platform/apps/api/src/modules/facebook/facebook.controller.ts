import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { FacebookService } from './facebook.service';
import { ConnectUrlResponseDto } from './dto/connect-url-response.dto';
import { ConnectPageDto, ConnectedPageResponseDto } from './dto/connect-page.dto';

/**
 * Facebook integration endpoints, scoped under a workspace.
 *
 * All routes require a valid Clerk JWT and at minimum Owner or Editor role
 * on the target workspace (viewers cannot connect Facebook Pages).
 */
@ApiTags('facebook')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('workspaces')
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  /**
   * Returns a Facebook OAuth authorization URL for connecting a Page to the workspace.
   *
   * The client should redirect the user's browser to `url`. The returned `state`
   * token must be stored locally and compared against the `state` query-parameter
   * returned by Facebook in the OAuth callback to prevent CSRF attacks.
   *
   * @param workspaceId - UUID of the workspace to connect a Facebook Page to.
   */
  @Get(':workspaceId/facebook/connect-url')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @ApiOperation({ summary: 'Get Facebook OAuth connect URL for a workspace' })
  @ApiOkResponse({ type: ConnectUrlResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient workspace role (Owner or Editor required)' })
  getConnectUrl(@Param('workspaceId') workspaceId: string): ConnectUrlResponseDto {
    const result = this.facebookService.getConnectUrl(workspaceId);
    return result.match(
      (connectUrl) => connectUrl,
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Completes the Facebook OAuth flow and connects the user's Pages to the workspace.
   *
   * Receives the `code` and `state` from the Facebook OAuth redirect. The backend
   * verifies the CSRF state, exchanges the code for long-lived page access tokens,
   * and persists each Page as a connected account. Tokens are stored encrypted
   * (AES-256-GCM) and never returned in the response (BR-F11).
   *
   * @param workspaceId - UUID of the workspace. Must match the `workspaceId` embedded
   *   in the `state` token (BR-R05); mismatch → 403 CROSS_WORKSPACE.
   * @param dto         - `{ code, state }` from the Facebook redirect.
   */
  @Post(':workspaceId/facebook/pages')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect Facebook Pages via OAuth callback' })
  @ApiCreatedResponse({ type: [ConnectedPageResponseDto], description: 'Pages connected (tokens not included)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient role or CSRF state mismatch (BR-R05)' })
  @ApiNotFoundResponse({ description: 'User manages no Facebook Pages' })
  async connectPage(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectPageDto,
  ): Promise<ConnectedPageResponseDto[]> {
    const result = await this.facebookService.connectPage(workspaceId, dto.code, dto.state);
    return result.match(
      (pages) => pages,
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Refreshes the stored Page access token for a connected Facebook account.
   *
   * Calls the Facebook Graph API `fb_exchange_token` flow with the current
   * encrypted token and persists the new ciphertext. The plaintext token is
   * never returned (BR-F11). Use this before `FacebookAccount.tokenExpiresAt`
   * to avoid requiring users to re-run the full OAuth flow.
   *
   * @param workspaceId - UUID of the workspace that owns the Page.
   * @param accountId   - UUID v7 of the `core.facebook_accounts` record to refresh.
   */
  @Post(':workspaceId/facebook/pages/:accountId/refresh-token')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh the stored Page access token for a connected account' })
  @ApiOkResponse({ description: 'Token refreshed and stored; no token returned (BR-F11)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient workspace role (Owner or Editor required)' })
  @ApiNotFoundResponse({ description: 'FacebookAccount not found in this workspace' })
  async refreshToken(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ): Promise<void> {
    const result = await this.facebookService.refreshAccountToken(workspaceId, accountId);
    result.match(
      () => undefined,
      (e) => { throw toHttpException(e); },
    );
  }
}
