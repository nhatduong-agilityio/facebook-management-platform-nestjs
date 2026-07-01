import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IFacebookOAuthProvider } from './ports/facebook-oauth.provider.port';
import { FacebookOAuthAdapter } from './adapters/facebook-oauth.adapter';
import { FacebookService } from './facebook.service';
import { FacebookController } from './facebook.controller';

/**
 * Facebook integration module.
 *
 * Owns all Facebook OAuth and Graph API flows (T2.1 – T2.3).
 * Imports `IdentityModule` to consume `ClerkAuthGuard` and `WorkspaceRolesGuard`.
 * `IFacebookOAuthProvider` is bound to `FacebookOAuthAdapter` which reads
 * `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` from env.
 */
@Module({
  imports: [IdentityModule],
  controllers: [FacebookController],
  providers: [
    FacebookService,
    { provide: IFacebookOAuthProvider, useClass: FacebookOAuthAdapter },
  ],
  exports: [FacebookService],
})
export class FacebookModule {}
