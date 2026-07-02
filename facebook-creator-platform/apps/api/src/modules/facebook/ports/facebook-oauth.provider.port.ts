/**
 * Result shape returned by `IFacebookOAuthProvider.buildConnectUrl`.
 */
export interface ConnectUrl {
  /** Full Facebook OAuth authorization URL to redirect the user to. */
  url: string;
  /**
   * CSRF state token: `base64url(payload).<hmac>`.
   * The callback (T2.2) must verify this signature before accepting the code.
   */
  state: string;
}

/**
 * Port (outbound): constructs Facebook OAuth URLs and verifies OAuth state tokens.
 *
 * Implementations read `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and
 * `FACEBOOK_REDIRECT_URI` from the environment. Services depend on this
 * abstract class and never import `ConfigService` directly (§14).
 */
export abstract class IFacebookOAuthProvider {
  /**
   * Builds a Facebook OAuth authorization URL for the given workspace.
   *
   * @param workspaceId - UUID of the workspace initiating the connection.
   *   Encoded into the CSRF `state` so the callback can associate tokens.
   * @returns `{ url, state }` — redirect the user to `url`; persist `state`
   *   for callback verification.
   */
  abstract buildConnectUrl(workspaceId: string): ConnectUrl;

  /**
   * Verifies a CSRF state token received in the OAuth callback.
   *
   * Checks two things:
   * 1. The HMAC signature is valid (prevents token tampering).
   * 2. The `workspaceId` embedded in the state matches the URL parameter (BR-R05).
   *
   * Uses a timing-safe comparison to prevent timing attacks.
   *
   * @param state       - State token from the Facebook redirect (`base64url(payload).<hmac>`).
   * @param workspaceId - UUID to compare against the state payload.
   * @returns `true` if the token is authentic and belongs to `workspaceId`; `false` otherwise.
   */
  abstract verifyState(state: string, workspaceId: string): boolean;

  /**
   * Validates a Facebook webhook `hub.verify_token` against the configured
   * `FACEBOOK_WEBHOOK_VERIFY_TOKEN` secret.
   *
   * Used by `GET /webhooks/facebook` (hub.challenge handshake). The comparison
   * uses a timing-safe equality check to prevent timing attacks.
   *
   * @param token - Value of `hub.verify_token` from the Facebook GET request.
   * @returns `true` if the token matches the configured secret; `false` otherwise.
   */
  abstract verifyWebhookToken(token: string): boolean;

  /**
   * Extracts the `workspaceId` from a state token **without** verifying the HMAC.
   *
   * Use this only to determine which workspace a callback belongs to before calling
   * `verifyState`. Never trust the extracted id as authoritative — always call
   * `verifyState` (or `connectPage` which calls it internally) afterwards.
   *
   * @param state - State token from the Facebook redirect (`base64url(payload).<hmac>`).
   * @returns The `workspaceId` string if the token is structurally valid; `null` otherwise.
   */
  abstract extractWorkspaceId(state: string): string | null;
}
