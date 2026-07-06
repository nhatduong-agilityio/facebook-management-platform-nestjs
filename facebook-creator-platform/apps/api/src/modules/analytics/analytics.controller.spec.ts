import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsController } from './analytics.controller';
import { IAnalyticsClient } from './ports/analytics-http.client.port';
import { DownstreamServiceError } from '../../common/http/http-client.port';
import type { MetricsSummaryDto } from './dto/analytics.dto';

const makeMetrics = (overrides: Partial<MetricsSummaryDto> = {}): MetricsSummaryDto => ({
  reach: 1000,
  impressions: 4000,
  likes: 120,
  comments: 15,
  shares: 8,
  ...overrides,
});

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let client: IAnalyticsClient;

  beforeEach(() => {
    client = {
      getWorkspaceMetrics: vi.fn(),
    } as unknown as IAnalyticsClient;
    controller = new AnalyticsController(client);
  });

  describe('getWorkspaceAnalytics', () => {
    it('returns metrics summary from the analytics client', async () => {
      const metrics = makeMetrics();
      vi.mocked(client.getWorkspaceMetrics).mockResolvedValue(metrics);

      const result = await controller.getWorkspaceAnalytics('ws-1');

      expect(client.getWorkspaceMetrics).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(metrics);
    });

    it('returns zero-value metrics when the service has no data', async () => {
      const zeros = makeMetrics({ reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0 });
      vi.mocked(client.getWorkspaceMetrics).mockResolvedValue(zeros);

      const result = await controller.getWorkspaceAnalytics('ws-1');

      expect(result.reach).toBe(0);
      expect(result.impressions).toBe(0);
    });

    it('throws 503 when the analytics service is unreachable', async () => {
      vi.mocked(client.getWorkspaceMetrics).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3002'),
      );

      await expect(controller.getWorkspaceAnalytics('ws-1')).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });
  });
});
