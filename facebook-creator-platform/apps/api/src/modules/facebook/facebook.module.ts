import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityModule } from '../identity/identity.module';
import { IFacebookOAuthProvider } from './ports/facebook-oauth.provider.port';
import { IFacebookGraphApiProvider } from './ports/facebook-graph-api.provider.port';
import { IFacebookAccountRepository } from './ports/facebook-account.repository.port';
import { FacebookOAuthAdapter } from './adapters/facebook-oauth.adapter';
import { FacebookGraphApiAdapter } from './adapters/facebook-graph-api.adapter';
import { MikroOrmFacebookAccountRepository } from './repositories/mikro-orm-facebook-account.repository';
import { FacebookAccount } from './entities/facebook-account.entity';
import { FacebookService } from './facebook.service';
import { FacebookController } from './facebook.controller';
import { FacebookCallbackController } from './facebook-callback.controller';
import { FacebookWebhookController } from './facebook-webhook.controller';
import { FacebookPageDeauthorizedConsumer } from './consumers/facebook-deauthorized.consumer';
import { FacebookTokenExpiryScheduler } from './jobs/facebook-token-expiry.job';

/**
 * Facebook integration module.
 *
 * Owns all Facebook OAuth, Graph API, and webhook flows (T2.1–T2.7).
 * Imports `IdentityModule` to consume `ClerkAuthGuard` and `WorkspaceRolesGuard`.
 *
 * `IEventBus` is resolved from the global `RabbitmqModule` (T2.6).
 * `MikroORM` is resolved from the global `DatabaseModule` (registered by `@mikro-orm/nestjs`).
 *
 * Port bindings:
 * - `IFacebookOAuthProvider` → `FacebookOAuthAdapter` (builds connect URLs + verifies webhook signatures)
 * - `IFacebookGraphApiProvider` → `FacebookGraphApiAdapter` (code exchange + page list)
 * - `IFacebookAccountRepository` → `MikroOrmFacebookAccountRepository` (persistence)
 */
@Module({
  imports: [IdentityModule, MikroOrmModule.forFeature([FacebookAccount])],
  controllers: [FacebookController, FacebookCallbackController, FacebookWebhookController],
  providers: [
    FacebookService,
    { provide: IFacebookOAuthProvider, useClass: FacebookOAuthAdapter },
    { provide: IFacebookGraphApiProvider, useClass: FacebookGraphApiAdapter },
    { provide: IFacebookAccountRepository, useClass: MikroOrmFacebookAccountRepository },
    FacebookPageDeauthorizedConsumer,
    FacebookTokenExpiryScheduler,
  ],
  exports: [FacebookService],
})
export class FacebookModule {}
