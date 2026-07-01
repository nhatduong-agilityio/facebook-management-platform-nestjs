import { Injectable } from '@nestjs/common';
import { Result, ok } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { IFacebookOAuthProvider, type ConnectUrl } from './ports/facebook-oauth.provider.port';

/**
 * Application service for Facebook integration flows.
 *
 * Depends only on abstract ports — no SDK, ORM, or ConfigService imports (§14).
 */
@Injectable()
export class FacebookService {
  constructor(private readonly oauthProvider: IFacebookOAuthProvider) {}

  /**
   * Generates a Facebook OAuth authorization URL for connecting a Page to a workspace.
   *
   * The `state` token encodes `workspaceId` and is HMAC-signed; the callback
   * (T2.2) must verify it before persisting the access token.
   *
   * @param workspaceId - UUID of the workspace initiating the Page connection.
   * @returns `ok({ url, state })` — always succeeds as long as env vars are present.
   */
  getConnectUrl(workspaceId: string): Result<ConnectUrl, AppError> {
    const connectUrl = this.oauthProvider.buildConnectUrl(workspaceId);
    return ok(connectUrl);
  }
}
