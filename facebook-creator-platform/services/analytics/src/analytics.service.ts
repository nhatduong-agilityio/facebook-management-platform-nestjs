import { Injectable } from '@nestjs/common';
import {
  IPostMetricsRepository,
  type MetricsSummary,
} from './ports/post-metrics.repository.port';
import type { PostMetrics } from './entities/post-metrics.entity';

/**
 * Read-side analytics service.
 *
 * Provides aggregated and per-post metrics to the HTTP controller.
 * Write-side (upsert) is handled by `PostPublishedConsumer` directly.
 */
@Injectable()
export class AnalyticsService {
  /** @param metricsRepo - Repository for `analytics.post_metrics`. */
  constructor(private readonly metricsRepo: IPostMetricsRepository) {}

  /**
   * Returns aggregate engagement totals for all posts in a workspace.
   *
   * @param workspaceId - UUID of the workspace in `core.workspaces`.
   * @returns Summed `{ reach, impressions, likes, comments, shares }`.
   */
  getWorkspaceMetrics(workspaceId: string): Promise<MetricsSummary> {
    return this.metricsRepo.aggregateByWorkspace(workspaceId);
  }

  /**
   * Returns the daily metric history for a single post, oldest first.
   *
   * @param postId - UUID of the post in `core.posts`.
   * @returns Array of `PostMetrics` rows (empty if no data exists yet).
   */
  getPostMetrics(postId: string): Promise<PostMetrics[]> {
    return this.metricsRepo.findByPost(postId);
  }
}
