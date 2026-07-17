import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AnalyticsService } from './analytics.service';
import type { MetricsSummary } from './ports/post-metrics.repository.port';
import type { PostMetrics } from './entities/post-metrics.entity';

/**
 * TCP RPC handlers for synchronous analytics queries from `apps/api` (ADR-094).
 *
 * Both handlers follow the §15 pattern: return the plain result on success;
 * throw `RpcException({ code, message })` on failure so the caller's TCP adapter
 * can surface a meaningful error without parsing raw Error messages.
 */
@Controller()
export class AnalyticsMessageController {
  /** @param analytics - Read-side analytics service. */
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Returns aggregate engagement totals for all posts in a workspace.
   *
   * Pattern: `analytics.workspace-metrics`
   * Payload: `{ workspaceId: string }`
   * Response: `MetricsSummary` — `{ reach, impressions, likes, comments, shares }`
   *
   * @param dto - RPC payload containing the workspace UUID.
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected service failure.
   */
  @MessagePattern('analytics.workspace-metrics')
  async getWorkspaceMetrics(
    @Payload() dto: { workspaceId: string },
  ): Promise<MetricsSummary> {
    try {
      return await this.analytics.getWorkspaceMetrics(dto.workspaceId);
    } catch (e) {
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Analytics service error',
      });
    }
  }

  /**
   * Returns the daily metric history for a single post, oldest first.
   *
   * Pattern: `analytics.post-metrics`
   * Payload: `{ postId: string }`
   * Response: `PostMetrics[]` — array of daily rows (empty if none exist).
   *
   * @param dto - RPC payload containing the post UUID.
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected service failure.
   */
  @MessagePattern('analytics.post-metrics')
  async getPostMetrics(
    @Payload() dto: { postId: string },
  ): Promise<PostMetrics[]> {
    try {
      return await this.analytics.getPostMetrics(dto.postId);
    } catch (e) {
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Analytics service error',
      });
    }
  }
}
