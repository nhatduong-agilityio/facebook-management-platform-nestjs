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
