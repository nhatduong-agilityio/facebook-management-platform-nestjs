/**
 * A single Facebook Page entry returned by the Graph API `/me/accounts` endpoint,
 * normalized to the shape the platform needs.
 */
export interface FacebookPageData {
  /** Facebook Page ID (external identifier). */
  id: string;
  /** Display name of the Page. */
  name: string;
  /** Long-lived Page access token. Never logged or returned to clients. */
  accessToken: string;
  /** Token expiry, or `null` if the token has no explicit expiry. */
  expiresAt: Date | null;
}

/**
 * Port (outbound): Facebook Graph API operations needed for the OAuth Page-connect flow.
 *
 * Implementations read `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and
 * `FACEBOOK_REDIRECT_URI` from the environment. Services depend on this abstract
 * class and never import `ConfigService` directly (§14).
 *
 * Errors from Graph API calls are infrastructure failures — implementations throw
 * rather than returning `Result`. The service does not wrap these in `err()`.
 */
export abstract class IFacebookGraphApiProvider {
  /**
   * Exchanges an OAuth authorization code for the list of Facebook Pages the
   * user administers, with their long-lived Page access tokens.
   *
   * Internally performs three Graph API calls:
   * 1. `POST /oauth/access_token` — short-lived user token.
   * 2. `GET /oauth/access_token?grant_type=fb_exchange_token` — long-lived user token.
   * 3. `GET /me/accounts` — page list with per-page access tokens.
   *
   * @param code - Authorization code received from Facebook's OAuth redirect.
   * @returns Array of pages the user manages; may be empty if the user has no pages.
   * @throws If any Graph API call returns a non-2xx response or a malformed body.
   */
  abstract exchangeCodeForPages(code: string): Promise<FacebookPageData[]>;
}
