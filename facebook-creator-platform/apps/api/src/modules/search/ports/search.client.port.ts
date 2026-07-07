import type { SearchResultDto } from '../dto/search-result.dto';

/**
 * Port: outbound client contract for the search service.
 *
 * Transport-agnostic — bound to `SearchHttpClientAdapter` in `SearchModule`.
 * A future RabbitMQ RPC adapter or direct Algolia adapter can implement this
 * interface without changing the controller.
 */
export abstract class ISearchClient {
  /**
   * Performs a full-text search over posts, scoped to a workspace.
   *
   * @param workspaceId - UUID of the workspace (search filter).
   * @param query       - The search term(s).
   * @returns Array of matching post records.
   */
  abstract search(workspaceId: string, query: string): Promise<SearchResultDto[]>;
}
