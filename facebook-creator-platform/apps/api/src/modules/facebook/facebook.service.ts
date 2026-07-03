import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { IFacebookOAuthProvider, type ConnectUrl } from './ports/facebook-oauth.provider.port';
import { IFacebookGraphApiProvider } from './ports/facebook-graph-api.provider.port';
import { IFacebookAccountRepository } from './ports/facebook-account.repository.port';
import { IEventBus } from '../../common/events/event-bus.port';
import { FacebookFeedEvent } from './events/facebook-feed.event';
import { FacebookPageDeauthorizedEvent } from './events/facebook-deauthorized.event';
import { type ConnectedPageResponseDto } from './dto/connect-page.dto';

/**
 * Normalized shape of a Facebook webhook POST body.
 * Facebook sends `pages/feed` and page-level changes under `entry[].changes[]`.
 */
export interface FacebookWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      field: string;
      value: Record<string, unknown>;
    }>;
  }>;
}

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
    private readonly eventBus: IEventBus,
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
   * Refreshes the stored Page access token for a connected `FacebookAccount`.
   *
   * Loads the account (workspace-scoped), calls the Graph API `fb_exchange_token`
   * endpoint with the current decrypted token, then persists the new ciphertext.
   * The plaintext token is held in memory only for the duration of this call and
   * is never returned to the caller (BR-F11).
   *
   * @param workspaceId - UUID of the owning workspace (scope guard).
   * @param accountId   - UUID v7 of the `FacebookAccount` to refresh.
   * @returns `ok(undefined)` on success, or `err(NOT_FOUND)` if the account does
   *          not exist or belongs to a different workspace.
   */
  async refreshAccountToken(
    workspaceId: string,
    accountId: string,
  ): Promise<Result<undefined, AppError>> {
    const account = await this.facebookAccounts.findByIdAndWorkspace(accountId, workspaceId);
    if (!account) {
      return err(AppError.notFound('FacebookAccount', { accountId, workspaceId }));
    }

    const refreshed = await this.graphApi.refreshPageToken(account.accessToken);
    account.updateToken(refreshed.accessToken, refreshed.expiresAt);
    await this.facebookAccounts.save(account);

    return ok(undefined);
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
  /**
   * Verifies the `X-Hub-Signature-256` HMAC and publishes normalized domain events
   * for each recognized Facebook webhook change.
   *
   * Must be called **before** any business logic on incoming webhook payloads.
   * Recognized changes published to `fcp.events`:
   * - `field === 'feed'` + `verb === 'add'` → `FacebookFeedEvent` (routing key `facebook.feed`)
   * - `field === 'page'`                    → `FacebookPageDeauthorizedEvent` (routing key `facebook.page.deauthorized`)
   *
   * Unknown change fields are silently ignored (forward-compatibility).
   *
   * @param rawBody   - Unmodified request body buffer for HMAC verification.
   * @param sigHeader - Value of the `X-Hub-Signature-256` header.
   * @param payload   - Parsed webhook body.
   * @returns `ok(undefined)` on success, or `err(FORBIDDEN)` if the HMAC is invalid.
   */
  async processWebhookPayload(
    rawBody: Buffer,
    sigHeader: string,
    payload: FacebookWebhookPayload,
  ): Promise<Result<void, AppError>> {
    if (!this.oauthProvider.verifyWebhookSignature(rawBody, sigHeader)) {
      return err(AppError.forbidden('Invalid X-Hub-Signature-256'));
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'feed') {
          const postId = change.value['post_id'] as string | undefined;
          const verb = change.value['verb'] as string | undefined;
          if (postId && verb === 'add') {
            await this.eventBus.publish(new FacebookFeedEvent(postId, entry.id));
          }
        } else if (change.field === 'page') {
          await this.eventBus.publish(new FacebookPageDeauthorizedEvent(entry.id));
        }
      }
    }

    return ok(undefined);
  }

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
