import { Module } from '@nestjs/common';
import { IAlgoliaSearchProvider } from './ports/algolia-search.provider.port';
import { AlgoliaSearchAdapter } from './adapters/algolia-search.adapter';
import { SearchService } from './search.service';
import { SearchMessageController } from './search.message-controller';
import { PostCreatedConsumer } from './consumers/post-created.consumer';
import { PostUpdatedConsumer } from './consumers/post-updated.consumer';
import { PostPublishedConsumer } from './consumers/post-published.consumer';
import { PostFailedConsumer } from './consumers/post-failed.consumer';
import { PostDeletedConsumer } from './consumers/post-deleted.consumer';

/**
 * Feature module for the search service.
 *
 * Wires the `IAlgoliaSearchProvider → AlgoliaSearchAdapter` binding and
 * registers all five post-event consumers plus the TCP search handler.
 * All entries in `controllers[]` are required by `@nestjs/microservices`
 * for `@EventPattern` and `@MessagePattern` handler discovery.
 *
 * No HTTP server — `services/search` has no external clients or webhooks.
 * `apps/api` reaches it via TCP `@MessagePattern('search.query')` (ADR-094).
 *
 * Port bindings:
 * - `IAlgoliaSearchProvider` → `AlgoliaSearchAdapter`
 */
@Module({
  controllers: [
    SearchMessageController,
    PostCreatedConsumer,
    PostUpdatedConsumer,
    PostPublishedConsumer,
    PostFailedConsumer,
    PostDeletedConsumer,
  ],
  providers: [
    { provide: IAlgoliaSearchProvider, useClass: AlgoliaSearchAdapter },
    SearchService,
  ],
})
export class SearchModule {}
