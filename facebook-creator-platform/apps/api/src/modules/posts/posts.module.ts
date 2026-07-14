import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityModule } from '../identity/identity.module';
import { BillingModule } from '../billing/billing.module';
import { Post } from './entities/post.entity';
import { IPostRepository } from './ports/post.repository.port';
import { MikroOrmPostRepository } from './repositories/mikro-orm-post.repository';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PostCreatedConsumer } from './consumers/post-created.consumer';
import { PostPublishedConsumer } from './consumers/post-published.consumer';
import { FacebookFeedConsumer } from './consumers/facebook-feed.consumer';
import { PublishJob } from './jobs/publish.job';
import { PublishFallbackPollJob } from './jobs/publish-fallback-poll.job';
import { IFacebookGraphApiProvider } from '../facebook/ports/facebook-graph-api.provider.port';
import { FacebookGraphApiAdapter } from '../facebook/adapters/facebook-graph-api.adapter';

/**
 * Posts module: Post CRUD, plan-quota check, and domain event emission.
 *
 * `IEventBus` is resolved from the global `RabbitmqModule` (T2.6).
 * `IPostQuotaProvider` is resolved from `BillingModule` (T3.1 thin proxy —
 * calls `services/billing` over HTTP to get the workspace's plan post limit).
 *
 * Imports `IdentityModule` to consume `ClerkAuthGuard` and `WorkspaceRolesGuard`.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Post]),
    IdentityModule,
    BillingModule,
  ],
  controllers: [PostsController, PostCreatedConsumer, PostPublishedConsumer, FacebookFeedConsumer],
  providers: [
    PostsService,
    { provide: IPostRepository, useClass: MikroOrmPostRepository },
    { provide: IFacebookGraphApiProvider, useClass: FacebookGraphApiAdapter },
    PublishJob,
    PublishFallbackPollJob,
  ],
})
export class PostsModule {}
