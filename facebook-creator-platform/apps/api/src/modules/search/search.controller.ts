import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { AppError } from '../../common/errors/app-error';
import { DownstreamServiceError } from '../../common/errors/downstream-service.error';
import { ISearchClient } from './ports/search.client.port';
import { SearchResultDto } from './dto/search-result.dto';

/** Maps a caught downstream error to a clean `AppError`. */
function mapDownstreamError(e: unknown): AppError {
  if (e instanceof DownstreamServiceError) {
    return e.status >= 500
      ? AppError.serviceUnavailable('Search service')
      : AppError.internal(`Search service responded with unexpected ${e.status}`);
  }
  return AppError.internal('Unexpected error from search service');
}

/**
 * Proxy search endpoint in `apps/api`.
 *
 * Enforces Clerk JWT + workspace role guard, then forwards the query to
 * `services/search` via `ISearchClient → SearchHttpClientAdapter`.
 *
 * Route: `GET /workspaces/:workspaceId/search?q=`
 */
@ApiTags('search')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, WorkspaceRolesGuard)
@Roles('owner', 'editor', 'viewer')
@Controller('workspaces/:workspaceId')
export class SearchController {
  /** @param searchClient - Transport-agnostic client for the search service. */
  constructor(private readonly searchClient: ISearchClient) {}

  /**
   * Full-text search over posts within a workspace.
   *
   * Proxies to `services/search GET /search?workspaceId=…&q=…`.
   * Results are ordered by Algolia relevance score.
   *
   * @param workspaceId - UUID of the workspace (from URL; also read by auth guard).
   * @param q           - The search term(s).
   * @returns Array of matching post records from the Algolia index.
   */
  @Get('search')
  @ApiOperation({ summary: 'Full-text search over posts in a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiQuery({ name: 'q', description: 'Search term(s)', required: false })
  @ApiOkResponse({ type: [SearchResultDto], description: 'Matching posts ordered by relevance.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Clerk JWT.' })
  @ApiForbiddenResponse({ description: 'User is not a member of this workspace.' })
  @ApiServiceUnavailableResponse({ description: 'Search service is unreachable.' })
  async search(
    @Param('workspaceId') workspaceId: string,
    @Query('q') q: string = '',
  ): Promise<SearchResultDto[]> {
    try {
      return await this.searchClient.search(workspaceId, q);
    } catch (e) {
      throw toHttpException(mapDownstreamError(e));
    }
  }
}
