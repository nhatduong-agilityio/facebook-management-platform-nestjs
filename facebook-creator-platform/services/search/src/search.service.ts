import { Injectable } from '@nestjs/common';
import { IAlgoliaSearchProvider } from './ports/algolia-search.provider.port';
import type { SearchResultDto } from './dto/search-result.dto';

/**
 * Search service — thin facade over `IAlgoliaSearchProvider`.
 *
 * Write-side (index mutations) is handled directly in the five post-event consumers.
 * This service only exposes the read-side `search` operation for the HTTP controller.
 *
 * No `Result` wrapper — this method has no domain error path; Algolia failures
 * propagate as thrown exceptions and are caught by the controller's try/catch.
 */
@Injectable()
export class SearchService {
  /** @param algolia - Algolia provider port; production impl is `AlgoliaSearchAdapter`. */
  constructor(private readonly algolia: IAlgoliaSearchProvider) {}

  /**
   * Performs a full-text search over posts indexed in Algolia, scoped to a workspace.
   *
   * @param workspaceId - UUID of the workspace; used as an Algolia filter.
   * @param query       - The search term(s).
   * @returns Array of matching posts; throws on Algolia failure (caught in controller).
   */
  search(workspaceId: string, query: string): Promise<SearchResultDto[]> {
    return this.algolia.search(workspaceId, query);
  }
}
