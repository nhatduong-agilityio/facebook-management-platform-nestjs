import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IHttpClient } from '../../../common/http/http-client.port';
import { ISearchClient } from '../ports/search.client.port';
import type { SearchResultDto } from '../dto/search-result.dto';

/**
 * `ISearchClient` implementation that calls `services/search` over HTTP.
 *
 * Injects `IHttpClient` for transport — swapping to Axios or a direct Algolia
 * client requires only a new binding, not a rewrite of this adapter.
 *
 * Reads `SEARCH_SERVICE_URL` from config via `getOrThrow` — fails fast at startup
 * if the env var is absent rather than silently calling the wrong host.
 */
@Injectable()
export class SearchHttpClientAdapter extends ISearchClient {
  private readonly baseUrl: string;

  /**
   * @param http   - Outbound HTTP client (native fetch by default).
   * @param config - NestJS ConfigService; must have `SEARCH_SERVICE_URL` set.
   */
  constructor(
    private readonly http: IHttpClient,
    private readonly config: ConfigService,
  ) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('SEARCH_SERVICE_URL');
  }

  /**
   * Calls `GET /search?workspaceId=…&q=…` on the search service.
   *
   * @param workspaceId - UUID of the workspace (passed as a query parameter).
   * @param query       - The search term(s).
   * @returns Array of `SearchResultDto` hits.
   */
  async search(workspaceId: string, query: string): Promise<SearchResultDto[]> {
    const url = `${this.baseUrl}/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}`;
    return this.http.get<SearchResultDto[]>(url);
  }
}
