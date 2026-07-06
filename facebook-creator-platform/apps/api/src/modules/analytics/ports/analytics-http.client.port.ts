import type { MetricsSummaryDto } from '../dto/analytics.dto';

/**
 * Port: outbound client contract for the analytics service.
 *
 * Transport-agnostic by design — renamed from `IAnalyticsHttpClient` to `IAnalyticsClient`
 * so a future RabbitMQ RPC adapter can implement the same interface without leaking
 * HTTP in the name. Bound to `AnalyticsHttpClientAdapter` in `AnalyticsModule`.
 */
export abstract class IAnalyticsClient {
  /**
   * Returns aggregate engagement totals for all posts in a workspace.
   *
   * @param workspaceId - UUID of the workspace in `core.workspaces`.
   * @returns Summed `{ reach, impressions, likes, comments, shares }`.
   */
  abstract getWorkspaceMetrics(workspaceId: string): Promise<MetricsSummaryDto>;
}
