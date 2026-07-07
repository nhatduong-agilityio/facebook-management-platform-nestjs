import type { SearchResultDto } from '../dto/search-result.dto';

/**
 * Port for Algolia search operations.
 *
 * Abstracts the Algolia SDK so that consumers and services depend on this
 * interface rather than the SDK directly (Ports & Adapters §14).
 * Swap the adapter (e.g. to a mock) by changing only the module binding.
 */
export abstract class IAlgoliaSearchProvider {
  /**
   * Creates or replaces an Algolia record.
   *
   * @param objectID - The Algolia `objectID` (equals `postId`).
   * @param fields   - All indexable fields for the record.
   */
  abstract saveObject(objectID: string, fields: Record<string, unknown>): Promise<void>;

  /**
   * Updates only the supplied fields on an existing Algolia record.
   * Creates the record if it does not exist yet.
   *
   * @param objectID - The Algolia `objectID` (equals `postId`).
   * @param fields   - Fields to update (others are preserved).
   */
  abstract partialUpdateObject(objectID: string, fields: Record<string, unknown>): Promise<void>;

  /**
   * Removes a record from the Algolia index.
   *
   * @param objectID - The Algolia `objectID` (equals `postId`).
   */
  abstract deleteObject(objectID: string): Promise<void>;

  /**
   * Performs a full-text search scoped to a workspace.
   *
   * @param workspaceId - UUID of the workspace (filters Algolia results).
   * @param query       - The search term(s).
   * @returns Matching posts formatted as `SearchResultDto[]`.
   */
  abstract search(workspaceId: string, query: string): Promise<SearchResultDto[]>;
}
