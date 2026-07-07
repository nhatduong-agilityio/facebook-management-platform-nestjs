import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { algoliasearch } from 'algoliasearch';
import type { SearchClient } from 'algoliasearch';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';
import type { SearchResultDto } from '../dto/search-result.dto';

/**
 * Production adapter for `IAlgoliaSearchProvider`.
 *
 * Uses the `algoliasearch` v5 SDK. Reads configuration from env vars:
 * - `ALGOLIA_APP_ID`     — Algolia application id.
 * - `ALGOLIA_API_KEY`    — Admin or write API key (write operations require admin key).
 * - `ALGOLIA_POSTS_INDEX` — Name of the index storing post records.
 *
 * All write operations (`saveObject`, `partialUpdateObject`, `deleteObject`) resolve
 * after the operation is enqueued by Algolia. Eventual consistency is acceptable — the
 * index reflects the latest event state once the task is processed on Algolia's end.
 */
@Injectable()
export class AlgoliaSearchAdapter extends IAlgoliaSearchProvider implements OnModuleInit {
  private readonly client: SearchClient;
  private readonly indexName: string;

  /** @param config - NestJS ConfigService; reads Algolia env vars at construction time. */
  constructor(private readonly config: ConfigService) {
    super();
    this.client = algoliasearch(
      config.getOrThrow<string>('ALGOLIA_APP_ID'),
      config.getOrThrow<string>('ALGOLIA_API_KEY'),
    );
    this.indexName = config.getOrThrow<string>('ALGOLIA_POSTS_INDEX');
  }

  /**
   * Ensures the Algolia index has the required configuration before any search
   * or write operation runs.
   *
   * `filterOnly(workspaceId)` makes `workspaceId` a filterable attribute without
   * building a facet count index — required for `filters: 'workspaceId:...'` to work.
   * `searchableAttributes` restricts full-text search to `title` and `content`
   * so UUID fields like `postId` are never matched by a text query.
   */
  async onModuleInit(): Promise<void> {
    await this.client.setSettings({
      indexName: this.indexName,
      indexSettings: {
        attributesForFaceting: ['filterOnly(workspaceId)'],
        searchableAttributes: ['title', 'content'],
      },
    });
  }

  /** {@inheritDoc IAlgoliaSearchProvider.saveObject} */
  async saveObject(objectID: string, fields: Record<string, unknown>): Promise<void> {
    await this.client.saveObject({
      indexName: this.indexName,
      body: { objectID, ...fields },
    });
  }

  /** {@inheritDoc IAlgoliaSearchProvider.partialUpdateObject} */
  async partialUpdateObject(objectID: string, fields: Record<string, unknown>): Promise<void> {
    await this.client.partialUpdateObject({
      indexName: this.indexName,
      objectID,
      attributesToUpdate: fields,
    });
  }

  /** {@inheritDoc IAlgoliaSearchProvider.deleteObject} */
  async deleteObject(objectID: string): Promise<void> {
    await this.client.deleteObject({
      indexName: this.indexName,
      objectID,
    });
  }

  /** {@inheritDoc IAlgoliaSearchProvider.search} */
  async search(workspaceId: string, query: string): Promise<SearchResultDto[]> {
    const response = await this.client.searchSingleIndex({
      indexName: this.indexName,
      searchParams: {
        query,
        filters: `workspaceId:${workspaceId}`,
      },
    });

    return (response.hits as Record<string, unknown>[]).map((hit) => ({
      postId: hit['objectID'] as string,
      workspaceId: hit['workspaceId'] as string,
      title: hit['title'] as string | undefined,
      content: hit['content'] as string,
      status: hit['status'] as string,
      scheduledAt: hit['scheduledAt'] as string | undefined,
      createdAt: hit['createdAt'] as string,
      facebookGraphPostId: hit['facebookGraphPostId'] as string | undefined,
      publishedAt: hit['publishedAt'] as string | undefined,
      failedAt: hit['failedAt'] as string | undefined,
    }));
  }
}
