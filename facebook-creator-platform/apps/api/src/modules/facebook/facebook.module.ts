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

/**
 * Facebook integration module.
 *
 * Owns all Facebook OAuth and Graph API flows (T2.1 – T2.3).
 * Imports `IdentityModule` to consume `ClerkAuthGuard` and `WorkspaceRolesGuard`.
 *
 * Port bindings:
 * - `IFacebookOAuthProvider` → `FacebookOAuthAdapter` (builds connect URLs + verifies state)
 * - `IFacebookGraphApiProvider` → `FacebookGraphApiAdapter` (code exchange + page list)
 * - `IFacebookAccountRepository` → `MikroOrmFacebookAccountRepository` (persistence)
 */
@Module({
  imports: [IdentityModule, MikroOrmModule.forFeature([FacebookAccount])],
  controllers: [FacebookController, FacebookCallbackController],
  providers: [
    FacebookService,
    { provide: IFacebookOAuthProvider, useClass: FacebookOAuthAdapter },
    { provide: IFacebookGraphApiProvider, useClass: FacebookGraphApiAdapter },
    { provide: IFacebookAccountRepository, useClass: MikroOrmFacebookAccountRepository },
  ],
  exports: [FacebookService],
})
export class FacebookModule {}
