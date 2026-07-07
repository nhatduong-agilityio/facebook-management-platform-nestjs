import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IHttpClient } from '../../common/http/http-client.port';
import { FetchHttpClientAdapter } from '../../common/http/fetch-http-client.adapter';
import { ISearchClient } from './ports/search.client.port';
import { SearchHttpClientAdapter } from './adapters/search-http-client.adapter';
import { SearchController } from './search.controller';

/**
 * Thin proxy module in `apps/api` for post-search operations.
 *
 * Owns NO entities, migrations, or Algolia SDK imports — all search index writes
 * happen in `services/search` (driven by RabbitMQ consumers). This module:
 * 1. Exposes `GET /workspaces/:workspaceId/search?q=` with Clerk JWT + any-role guard.
 * 2. Forwards requests to `services/search` via `ISearchClient → SearchHttpClientAdapter`
 *    (backed by `IHttpClient → FetchHttpClientAdapter` with 5s timeout).
 *
 * Port bindings:
 * - `IHttpClient`   → `FetchHttpClientAdapter` (native fetch, 5 s timeout)
 * - `ISearchClient` → `SearchHttpClientAdapter` (calls `SEARCH_SERVICE_URL`)
 */
@Module({
  imports: [IdentityModule],
  controllers: [SearchController],
  providers: [
    { provide: IHttpClient, useClass: FetchHttpClientAdapter },
    { provide: ISearchClient, useClass: SearchHttpClientAdapter },
  ],
})
export class SearchModule {}
