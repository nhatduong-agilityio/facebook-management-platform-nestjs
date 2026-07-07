import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchResultDto } from './dto/search-result.dto';

/**
 * HTTP read endpoint for the search service.
 *
 * This endpoint is **internal** — called only by `apps/api`'s search proxy module.
 * No Clerk JWT or workspace role guard is applied here; access control is enforced
 * by `apps/api` before forwarding the request.
 */
@ApiTags('search')
@Controller('search')
export class SearchController {
  /** @param searchService - Read-side search facade. */
  constructor(private readonly searchService: SearchService) {}

  /**
   * Full-text search over posts for a given workspace.
   *
   * @param workspaceId - UUID of the workspace (Algolia filter).
   * @param q           - The search term(s).
   * @returns Array of matching post records from the Algolia index.
   */
  @Get()
  @ApiOperation({ summary: 'Search posts for a workspace' })
  @ApiQuery({ name: 'workspaceId', description: 'UUID of the workspace to search within' })
  @ApiQuery({ name: 'q', description: 'Search term(s)' })
  @ApiOkResponse({ type: [SearchResultDto] })
  async search(
    @Query('workspaceId') workspaceId: string,
    @Query('q') q: string,
  ): Promise<SearchResultDto[]> {
    return this.searchService.search(workspaceId, q ?? '');
  }
}
