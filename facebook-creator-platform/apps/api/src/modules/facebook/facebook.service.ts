import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { IFacebookOAuthProvider, type ConnectUrl } from './ports/facebook-oauth.provider.port';
import { IFacebookGraphApiProvider } from './ports/facebook-graph-api.provider.port';
import { IFacebookAccountRepository } from './ports/facebook-account.repository.port';
import { type ConnectedPageResponseDto } from './dto/connect-page.dto';

/**
 * Application service for Facebook integration flows.
 *
 * Depends only on abstract ports — no SDK, ORM, or ConfigService imports (§14).
 * All domain-level failures are returned as `Result<T, AppError>`; infrastructure
 * errors from Graph API calls propagate as thrown exceptions (HTTP 500).
 */
@Injectable()
export class FacebookService {
  constructor(
    private readonly oauthProvider: IFacebookOAuthProvider,
    private readonly graphApi: IFacebookGraphApiProvider,
    private readonly facebookAccounts: IFacebookAccountRepository,
  ) {}

  /**
   * Generates a Facebook OAuth authorization URL for connecting a Page to a workspace.
   *
   * The `state` token encodes `workspaceId` and is HMAC-signed; the callback
   * must call `connectPage` with this state to satisfy the CSRF guard (BR-R05).
   *
   * @param workspaceId - UUID of the workspace initiating the Page connection.
   * @returns `ok({ url, state })` — always succeeds as long as env vars are present.
   */
  getConnectUrl(workspaceId: string): Result<ConnectUrl, AppError> {
    const connectUrl = this.oauthProvider.buildConnectUrl(workspaceId);
    return ok(connectUrl);
  }

  /**
   * Validates a Facebook webhook hub.challenge handshake request.
   *
   * Facebook sends `GET /webhooks/facebook?hub.mode=subscribe&hub.verify_token=<secret>&hub.challenge=<nonce>`
   * when the webhook URL is registered or re-verified in the App Dashboard.
   * The endpoint must respond with the raw `hub.challenge` string if the token matches.
   *
   * @param mode        - Must be `"subscribe"`.
   * @param verifyToken - Secret string that must match `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
   * @param challenge   - Opaque nonce string to echo back to Facebook.
   * @returns `ok(challenge)` to confirm the handshake, or `err(FORBIDDEN)` on mismatch.
   */
  verifyWebhookChallenge(
    mode: string,
    verifyToken: string,
    challenge: string,
  ): Result<string, AppError> {
    if (mode !== 'subscribe') {
      return err(AppError.forbidden('hub.mode must be "subscribe"'));
    }
    if (!this.oauthProvider.verifyWebhookToken(verifyToken)) {
      return err(AppError.forbidden('Invalid hub.verify_token'));
    }
    return ok(challenge);
  }

  /**
   * Handles the Facebook OAuth callback when there is no frontend to extract the
   * `workspaceId` from the URL. The workspace is resolved from the signed state token.
   *
   * This method is called by `GET /facebook/callback` (the backend-only callback route).
   * It extracts the `workspaceId` from the state payload and delegates to `connectPage`,
   * which re-verifies the full HMAC before accepting the code.
   *
   * @param code  - OAuth authorization code from the Facebook redirect query parameter.
   * @param state - CSRF state token from the Facebook redirect query parameter.
   * @returns Same result as `connectPage`, or `err(CROSS_WORKSPACE)` if the state is
   *          structurally invalid (malformed base64 or missing workspaceId).
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<Result<ConnectedPageResponseDto[], AppError>> {
    const workspaceId = this.oauthProvider.extractWorkspaceId(state);
    if (!workspaceId) {
      return err(
        new AppError('CROSS_WORKSPACE', 'Invalid OAuth state — cannot extract workspaceId'),
      );
    }
    return this.connectPage(workspaceId, code, state);
  }

  /**
   * Completes the Facebook OAuth flow by exchanging an authorization code for
   * page access tokens and persisting each connected Page.
   *
   * Steps:
   * 1. Verify the CSRF state HMAC and the embedded `workspaceId` (BR-R05).
   * 2. Exchange the code for long-lived page access tokens via the Graph API.
   * 3. Upsert a `FacebookAccount` per page (tokens stored encrypted via `EncryptedText`).
   * 4. Return page metadata — **never** the access token (BR-F11).
   *
   * @param workspaceId - UUID from the URL path; must match the state payload.
   * @param code        - OAuth authorization code from the Facebook redirect.
   * @param state       - CSRF state token originally issued by `getConnectUrl`.
   * @returns `ok(pages)` with page metadata (no tokens), or:
   *   - `err(CROSS_WORKSPACE)` if the state HMAC is invalid or `workspaceId` mismatches.
   *   - `err(NOT_FOUND)` if the user manages no Facebook Pages.
   */
  async connectPage(
    workspaceId: string,
    code: string,
    state: string,
  ): Promise<Result<ConnectedPageResponseDto[], AppError>> {
    if (!this.oauthProvider.verifyState(state, workspaceId)) {
      return err(
        new AppError(
          'CROSS_WORKSPACE',
          'Invalid OAuth state — HMAC mismatch or workspace mismatch (BR-R05)',
        ),
      );
    }

    const pages = await this.graphApi.exchangeCodeForPages(code);

    if (pages.length === 0) {
      return err(AppError.notFound('Facebook Pages', { workspaceId }));
    }

    const connected: ConnectedPageResponseDto[] = [];

    for (const page of pages) {
      const account = await this.facebookAccounts.connectPage(workspaceId, {
        pageId: page.id,
        pageName: page.name,
        accessToken: page.accessToken,
        tokenExpiresAt: page.expiresAt,
      });

      connected.push({
        id: account.id,
        pageId: account.pageId,
        pageName: account.pageName,
        connectedAt: account.connectedAt,
      });
    }

    return ok(connected);
  }
}
