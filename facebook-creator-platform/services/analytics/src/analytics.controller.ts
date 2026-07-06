import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import type { MetricsSummary } from './ports/post-metrics.repository.port';
import type { PostMetrics } from './entities/post-metrics.entity';

/**
 * Internal HTTP endpoints for analytics read queries.
 *
 * Called by `apps/api` (T3.5) to serve `GET /workspaces/:id/analytics` and
 * `GET /posts/:id/metrics` to authenticated API clients.
 *
 * No Clerk auth here — this service is not exposed to the public internet.
 * `apps/api` is responsible for enforcing workspace-scope access control before
 * proxying the request.
 */
@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  /** @param service - Read-side analytics service. */
  constructor(private readonly service: AnalyticsService) {}

  /**
   * Returns aggregate engagement totals for all posts in a workspace.
   *
   * @param workspaceId - UUID of the workspace (from URL path).
   * @returns `{ reach, impressions, likes, comments, shares }` summed across all posts.
   */
  @ApiOperation({ summary: 'Aggregate metrics for a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @Get('workspaces/:workspaceId/metrics')
  getWorkspaceMetrics(@Param('workspaceId') workspaceId: string): Promise<MetricsSummary> {
    return this.service.getWorkspaceMetrics(workspaceId);
  }

  /**
   * Returns the daily metric history for a specific post.
   *
   * @param postId - UUID of the post (from URL path).
   * @returns Array of daily `PostMetrics` rows (empty if no data exists yet).
   */
  @ApiOperation({ summary: 'Daily metrics for a specific post' })
  @ApiParam({ name: 'postId', description: 'Post UUID' })
  @Get('posts/:postId/metrics')
  getPostMetrics(@Param('postId') postId: string): Promise<PostMetrics[]> {
    return this.service.getPostMetrics(postId);
  }
}
