import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsController } from './analytics.controller';
import { IAnalyticsClient } from './ports/analytics-http.client.port';
import { DownstreamServiceError } from '../../common/http/http-client.port';
import type { MetricsSummaryDto, PostMetricsDayDto } from './dto/analytics.dto';

const makeMetrics = (overrides: Partial<MetricsSummaryDto> = {}): MetricsSummaryDto => ({
  reach: 1000,
  impressions: 4000,
  likes: 120,
  comments: 15,
  shares: 8,
  ...overrides,
});

const makePostMetrics = (): PostMetricsDayDto[] => [
  {
    id: 'pm-1',
    postId: 'post-1',
    metricDate: '2026-07-15',
    reach: 420,
    impressions: 1200,
    likes: 38,
    comments: 4,
    shares: 2,
    createdAt: '2026-07-15T12:00:00Z',
  },
];

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let client: IAnalyticsClient;

  beforeEach(() => {
    client = {
      getWorkspaceMetrics: vi.fn(),
      getPostMetrics: vi.fn(),
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

  describe('getPostAnalytics', () => {
    it('returns daily metric rows from the analytics client', async () => {
      const metrics = makePostMetrics();
      vi.mocked(client.getPostMetrics).mockResolvedValue(metrics);

      const result = await controller.getPostAnalytics('post-1');

      expect(client.getPostMetrics).toHaveBeenCalledWith('post-1');
      expect(result).toHaveLength(1);
      expect(result[0].postId).toBe('post-1');
      expect(result[0].metricDate).toBe('2026-07-15');
    });

    it('returns an empty array when no data has been ingested', async () => {
      vi.mocked(client.getPostMetrics).mockResolvedValue([]);

      const result = await controller.getPostAnalytics('post-no-data');

      expect(result).toEqual([]);
    });

    it('throws 503 when the analytics service is unreachable', async () => {
      vi.mocked(client.getPostMetrics).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3002'),
      );

      await expect(controller.getPostAnalytics('post-1')).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });
  });
});
