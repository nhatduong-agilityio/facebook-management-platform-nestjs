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
 * Port (outbound): constructs Facebook OAuth URLs.
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
}
