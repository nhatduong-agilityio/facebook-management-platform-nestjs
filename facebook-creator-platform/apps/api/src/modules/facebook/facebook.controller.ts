import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
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
}
