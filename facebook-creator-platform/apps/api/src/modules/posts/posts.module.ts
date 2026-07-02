import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityModule } from '../identity/identity.module';
import { Post } from './entities/post.entity';
import { IPostRepository } from './ports/post.repository.port';
import { IPostQuotaProvider } from './ports/post-quota.provider.port';
import { IEventBus } from '../../common/events/event-bus.port';
import { NoopEventBus } from '../../common/events/noop-event-bus';
import { MikroOrmPostRepository } from './repositories/mikro-orm-post.repository';
import { HardcodedPostQuotaAdapter } from './adapters/hardcoded-post-quota.adapter';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';

/**
 * Posts module: Post CRUD, plan-quota check, and domain event emission.
 *
 * `IEventBus` is bound to `NoopEventBus` until T2.6 wires the RabbitMQ publisher.
 * `IPostQuotaProvider` is bound to `HardcodedPostQuotaAdapter` until T3.1 integrates
 * the real billing lookup (`billing.plans.post_limit` via subscription).
 *
 * Imports `IdentityModule` to consume `ClerkAuthGuard` and `WorkspaceRolesGuard`.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Post]),
    IdentityModule,
  ],
  controllers: [PostsController],
  providers: [
    PostsService,
    { provide: IPostRepository, useClass: MikroOrmPostRepository },
    { provide: IPostQuotaProvider, useClass: HardcodedPostQuotaAdapter },
    { provide: IEventBus, useClass: NoopEventBus },
  ],
})
export class PostsModule {}
