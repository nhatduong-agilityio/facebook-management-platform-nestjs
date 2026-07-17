import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { SearchService } from './search.service';
import type { SearchResultDto } from './dto/search-result.dto';

/**
 * TCP RPC handler for synchronous search queries from `apps/api` (ADR-094).
 *
 * Follows the §15 pattern: returns the plain result on success; throws
 * `RpcException({ code, message })` on failure so the caller's TCP adapter
 * can surface a meaningful error without parsing raw Error messages.
 */
@Controller()
export class SearchMessageController {
  /** @param searchService - Read-side search facade over Algolia. */
  constructor(private readonly searchService: SearchService) {}

  /**
   * Executes a full-text search over posts indexed in Algolia, scoped to a workspace.
   *
   * Pattern: `search.query`
   * Payload: `{ workspaceId: string; query: string }`
   * Response: `SearchResultDto[]` — matching post records from the Algolia index.
   *
   * @param dto - RPC payload containing the workspace UUID and search term(s).
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected Algolia failure.
   */
  @MessagePattern('search.query')
  async search(
    @Payload() dto: { workspaceId: string; query: string },
  ): Promise<SearchResultDto[]> {
    try {
      return await this.searchService.search(dto.workspaceId, dto.query);
    } catch (e) {
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Search service error',
      });
    }
  }
}
