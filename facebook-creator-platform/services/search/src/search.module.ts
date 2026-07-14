import { Module } from '@nestjs/common';
import { IAlgoliaSearchProvider } from './ports/algolia-search.provider.port';
import { AlgoliaSearchAdapter } from './adapters/algolia-search.adapter';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PostCreatedConsumer } from './consumers/post-created.consumer';
import { PostUpdatedConsumer } from './consumers/post-updated.consumer';
import { PostPublishedConsumer } from './consumers/post-published.consumer';
import { PostFailedConsumer } from './consumers/post-failed.consumer';
import { PostDeletedConsumer } from './consumers/post-deleted.consumer';

/**
 * Feature module for the search service.
 *
 * Wires the `IAlgoliaSearchProvider → AlgoliaSearchAdapter` binding and
 * registers all five post-event consumers plus the HTTP search endpoint.
 * Consumers are in `controllers[]` (not `providers[]`) as required by
 * `@nestjs/microservices` for `@EventPattern` handler discovery.
 */
@Module({
  controllers: [
    SearchController,
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
