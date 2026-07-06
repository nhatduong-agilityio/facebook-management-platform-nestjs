/**
 * Engagement metrics returned by the Facebook Graph API insights endpoint.
 * All values default to 0 when the API omits a metric (e.g. unpublished post).
 */
export interface PostInsightsResult {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Port: Facebook Graph API insights adapter.
 *
 * Implementations call `GET /{graphPostId}/insights` with the page access token.
 * Services depend on this abstract class only (§14 — ports & adapters).
 */
export abstract class IFacebookInsightsProvider {
  /**
   * Fetches engagement insights for a published Facebook post.
   *
   * @param graphPostId - Graph API post id (e.g. `<pageId>_<postId>`).
   * @param pageToken   - Decrypted page access token.
   * @returns Metric values; fields default to 0 when the Graph API returns no data.
   */
  abstract getPostInsights(graphPostId: string, pageToken: string): Promise<PostInsightsResult>;
}
