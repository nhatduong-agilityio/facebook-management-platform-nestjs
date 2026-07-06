import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetricsSummaryResponse } from '@fcp/analytics-contracts';
import { IHttpClient } from '../../../common/http/http-client.port';
import { IAnalyticsClient } from '../ports/analytics-http.client.port';
import type { MetricsSummaryDto } from '../dto/analytics.dto';

/** Maps the wire response to the API's public `MetricsSummaryDto`. */
function toDto(raw: MetricsSummaryResponse): MetricsSummaryDto {
  return {
    reach: raw.reach,
    impressions: raw.impressions,
    likes: raw.likes,
    comments: raw.comments,
    shares: raw.shares,
  };
}

/**
 * `IAnalyticsClient` implementation that calls `services/analytics` over HTTP.
 *
 * Injects `IHttpClient` for transport — swapping to Axios or RabbitMQ RPC requires
 * only a new `IHttpClient` binding, not a rewrite of this adapter.
 *
 * Reads `ANALYTICS_SERVICE_URL` from config via `getOrThrow` — fails fast at startup
 * if the env var is absent.
 */
@Injectable()
export class AnalyticsHttpClientAdapter extends IAnalyticsClient {
  private readonly baseUrl: string;

  /**
   * @param http   - Outbound HTTP client (native fetch by default).
   * @param config - NestJS ConfigService; must have `ANALYTICS_SERVICE_URL` set.
   */
  constructor(
    private readonly http: IHttpClient,
    private readonly config: ConfigService,
  ) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('ANALYTICS_SERVICE_URL');
  }

  /**
   * Calls `GET /workspaces/:workspaceId/metrics` on the analytics service.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Mapped `MetricsSummaryDto`.
   */
  async getWorkspaceMetrics(workspaceId: string): Promise<MetricsSummaryDto> {
    const raw = await this.http.get<MetricsSummaryResponse>(
      `${this.baseUrl}/workspaces/${workspaceId}/metrics`,
    );
    return toDto(raw);
  }
}
