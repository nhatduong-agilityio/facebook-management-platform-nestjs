/**
 * Payload of the `posts.published` event published by `apps/api` after a
 * Facebook post is confirmed live. Consumed by `services/analytics` to fetch
 * Graph API insights and upsert `analytics.post_metrics`.
 *
 * Only UUIDs — no PII (ADR-049).
 */
export interface PostPublishedPayload {
  eventId: string;
  postId: string;
  workspaceId: string;
  facebookGraphPostId: string;
  facebookAccountId: string;
}
