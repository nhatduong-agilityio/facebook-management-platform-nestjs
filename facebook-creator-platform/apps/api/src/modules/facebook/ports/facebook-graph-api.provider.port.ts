/**
 * Result of a Page access token refresh via `fb_exchange_token`.
 * The token is a plaintext string; callers must never log it.
 */
export interface RefreshedToken {
  /** New long-lived Page access token (plaintext). Never log or return to clients. */
  accessToken: string;
  /**
   * When the new token expires, or `null` for non-expiring Page tokens.
   * Non-expiring tokens are common when derived from a long-lived user token.
   */
  expiresAt: Date | null;
}

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
 * Result of a successful post submission to `POST /{pageId}/feed`.
 */
export interface PublishedPostResult {
  /** The Facebook Graph API post id (format: `<pageId>_<postId>`). */
  postId: string;
}

/**
 * Port (outbound): Facebook Graph API operations needed for the OAuth Page-connect flow,
 * post publishing, and fallback polling.
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

  /**
   * Extends a Page access token to a new long-lived token via `fb_exchange_token`.
   *
   * Calls `GET /oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token=<current>`.
   * Use this before a token expires (check `FacebookAccount.tokenExpiresAt`) to avoid
   * having to re-run the full OAuth flow.
   *
   * @param pageAccessToken - Current plaintext Page access token (decrypted by caller).
   * @returns New token and its expiry. `expiresAt` is `null` for non-expiring Page tokens.
   * @throws If the Graph API returns a non-2xx response or a malformed body.
   */
  abstract refreshPageToken(pageAccessToken: string): Promise<RefreshedToken>;

  /**
   * Publishes a post to a Facebook Page via `POST /{pageId}/feed`.
   *
   * Called synchronously by the Publish Job when a scheduled post's `scheduledAt`
   * has elapsed. On success the caller transitions the post to `publishing` and stores
   * the returned `postId` as `facebookGraphPostId`.
   *
   * @param pageId          - Facebook Page ID (e.g. `"112233445566"`).
   * @param pageAccessToken - Plaintext Page access token (decrypted by caller — BR-F11).
   * @param content         - Post body text (`message` field in Graph API).
   * @param mediaUrl        - Optional media attachment URL (`link` field). Omitted if not set.
   * @returns The Graph API post id in `<pageId>_<postId>` format.
   * @throws If the Graph API returns a non-2xx response or a malformed body.
   */
  abstract publishPost(
    pageId: string,
    pageAccessToken: string,
    content: string,
    mediaUrl?: string,
  ): Promise<PublishedPostResult>;

  /**
   * Checks whether a published post is reachable via the Graph API (`GET /{postId}`).
   *
   * Used by the fallback poll job (T2.9) to confirm `publishing → published` when a
   * Facebook webhook was not received within `PUBLISH_TTL_MINUTES`.
   *
   * Returns `true` if the Graph API responds with an `id` field, `false` on a 4xx/5xx
   * response (post removed, token expired, etc.). Any network-level error is re-thrown
   * so the caller can log and continue to the next post.
   *
   * @param facebookGraphPostId - The `<pageId>_<postId>` string stored on the `Post` entity.
   * @param pageAccessToken     - Plaintext Page access token (decrypted by caller — BR-F11).
   * @returns `true` when the post is live; `false` when it is not accessible.
   * @throws On network/infrastructure failure (not on a 4xx Graph API response).
   */
  abstract checkPostLive(
    facebookGraphPostId: string,
    pageAccessToken: string,
  ): Promise<boolean>;
}
