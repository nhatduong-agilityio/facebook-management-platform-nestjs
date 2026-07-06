import type { PostMetrics } from '../entities/post-metrics.entity';

/**
 * Shape of the data required to create or refresh a `PostMetrics` row.
 * All metric fields default to 0 when the Graph API returns no value.
 */
export interface PostMetricsData {
  postId: string;
  workspaceId: string;
  metricDate: Date;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Aggregated metrics summary for a workspace or post.
 * Returned by the HTTP read endpoints.
 */
export interface MetricsSummary {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Port: persistence contract for `PostMetrics` aggregates.
 *
 * Implementations handle all ORM details. Services depend on this abstract
 * class only (§14 — ports & adapters).
 */
export abstract class IPostMetricsRepository {
  /**
   * Inserts or updates a `post_metrics` row for the given `(postId, metricDate)` pair.
   *
   * Idempotent: re-delivering the same event on the same calendar day updates
   * the existing row's metric values rather than inserting a duplicate.
   *
   * @param data - Metric values and identifying fields.
   */
  abstract upsert(data: PostMetricsData): Promise<void>;

  /**
   * Returns all metric rows for a specific post, ordered by `metricDate` ascending.
   *
   * @param postId - UUID of the post in `core.posts`.
   * @returns Array of `PostMetrics` rows (empty if none exist).
   */
  abstract findByPost(postId: string): Promise<PostMetrics[]>;

  /**
   * Returns aggregate totals across all posts in a workspace.
   *
   * @param workspaceId - UUID of the workspace in `core.workspaces`.
   * @returns Summed metric values, or zeros if no rows exist.
   */
  abstract aggregateByWorkspace(workspaceId: string): Promise<MetricsSummary>;
}
