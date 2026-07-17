import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { IAnalyticsClient } from '../ports/analytics-http.client.port';
import { DownstreamServiceError } from '../../../common/errors/downstream-service.error';
import type { MetricsSummaryDto, PostMetricsDayDto } from '../dto/analytics.dto';

/** DI token for the analytics TCP `ClientProxy`. */
export const ANALYTICS_TCP_CLIENT = 'ANALYTICS_TCP_CLIENT';

/** Milliseconds before a TCP RPC call is abandoned and a 503 is surfaced. */
const TCP_TIMEOUT_MS = 3_000;

/**
 * `IAnalyticsClient` implementation backed by NestJS TCP transport (ADR-094).
 *
 * Replaces `AnalyticsHttpClientAdapter` as the concrete adapter for all sync calls
 * from `apps/api` to `services/analytics`. Error mapping preserves the same
 * `DownstreamServiceError` contract so `AnalyticsController` requires no changes.
 *
 * Error mapping:
 * - Any `RpcException` → `DownstreamServiceError(500)`
 * - Timeout / connection refused → `DownstreamServiceError(503)`
 */
@Injectable()
export class AnalyticsTcpAdapter extends IAnalyticsClient {
  /** @param client - NestJS `ClientProxy` bound to the analytics TCP transport. */
  constructor(@Inject(ANALYTICS_TCP_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  /**
   * Fetches aggregate engagement totals for all posts in a workspace via TCP.
   *
   * Pattern: `analytics.workspace-metrics` — payload `{ workspaceId }` → `MetricsSummaryDto`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Summed `{ reach, impressions, likes, comments, shares }`.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async getWorkspaceMetrics(workspaceId: string): Promise<MetricsSummaryDto> {
    try {
      return await firstValueFrom(
        this.client
          .send<MetricsSummaryDto>('analytics.workspace-metrics', { workspaceId })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Fetches daily metric rows for a specific post via TCP.
   *
   * Pattern: `analytics.post-metrics` — payload `{ postId }` → `PostMetricsDayDto[]`.
   * Returns an empty array when no Facebook Insights data has been ingested yet.
   *
   * @param postId - UUID v7 of the post in `core.posts`.
   * @returns Array of daily `PostMetricsDayDto` records, oldest first.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async getPostMetrics(postId: string): Promise<PostMetricsDayDto[]> {
    try {
      return await firstValueFrom(
        this.client
          .send<PostMetricsDayDto[]>('analytics.post-metrics', { postId })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Maps a TCP error to a `DownstreamServiceError` so callers retain the same
   * error-handling contract they had with `AnalyticsHttpClientAdapter`.
   */
  private mapError(e: unknown): DownstreamServiceError {
    if (e instanceof RpcException) {
      return new DownstreamServiceError(500, 'analytics');
    }
    return new DownstreamServiceError(503, 'analytics');
  }
}
