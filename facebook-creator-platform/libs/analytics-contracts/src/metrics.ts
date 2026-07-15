/**
 * Aggregated engagement totals for a workspace or post.
 *
 * Returned by `GET /workspaces/:id/metrics` on `services/analytics`.
 * Consumed by `apps/api` to serve `GET /workspaces/:id/analytics`.
 */
export interface MetricsSummaryResponse {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Daily metrics row for a single post.
 *
 * Returned by `GET /posts/:postId/metrics` on `services/analytics`.
 * Consumed by `apps/api` to serve `GET /workspaces/:id/posts/:postId/analytics`.
 */
export interface PostMetricsResponse {
  /** UUID v7 of the metric row. */
  id: string;
  /** UUID of the post this row belongs to. */
  postId: string;
  /** ISO 8601 date string for this metric bucket (e.g. `"2026-07-15"`). */
  metricDate: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  /** ISO 8601 timestamp when the row was first ingested. */
  createdAt: string;
}
