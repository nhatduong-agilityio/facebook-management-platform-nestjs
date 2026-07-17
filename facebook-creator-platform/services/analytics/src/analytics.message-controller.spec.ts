import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { AnalyticsMessageController } from './analytics.message-controller';
import { AnalyticsService } from './analytics.service';
import type { MetricsSummary } from './ports/post-metrics.repository.port';
import type { PostMetrics } from './entities/post-metrics.entity';

const mockAnalytics = {
  getWorkspaceMetrics: vi.fn(),
  getPostMetrics: vi.fn(),
} as unknown as AnalyticsService;

describe('AnalyticsMessageController', () => {
  let controller: AnalyticsMessageController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AnalyticsMessageController(mockAnalytics);
  });

  // ---------------------------------------------------------------------------
  // analytics.workspace-metrics
  // ---------------------------------------------------------------------------

  describe('getWorkspaceMetrics', () => {
    it('returns MetricsSummary from AnalyticsService', async () => {
      const summary: MetricsSummary = {
        reach: 1000,
        impressions: 5000,
        likes: 200,
        comments: 50,
        shares: 30,
      };
      vi.mocked(mockAnalytics.getWorkspaceMetrics).mockResolvedValue(summary);

      const result = await controller.getWorkspaceMetrics({ workspaceId: 'ws-1' });

      expect(result).toEqual(summary);
      expect(mockAnalytics.getWorkspaceMetrics).toHaveBeenCalledWith('ws-1');
    });

    it('throws RpcException on service failure', async () => {
      vi.mocked(mockAnalytics.getWorkspaceMetrics).mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(
        controller.getWorkspaceMetrics({ workspaceId: 'ws-1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });

  // ---------------------------------------------------------------------------
  // analytics.post-metrics
  // ---------------------------------------------------------------------------

  describe('getPostMetrics', () => {
    it('returns PostMetrics array from AnalyticsService', async () => {
      const rows = [
        { postId: 'p-1', reach: 500, impressions: 2000, likes: 80, comments: 10, shares: 5 },
      ] as unknown as PostMetrics[];
      vi.mocked(mockAnalytics.getPostMetrics).mockResolvedValue(rows);

      const result = await controller.getPostMetrics({ postId: 'p-1' });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ postId: 'p-1', reach: 500 });
      expect(mockAnalytics.getPostMetrics).toHaveBeenCalledWith('p-1');
    });

    it('throws RpcException on service failure', async () => {
      vi.mocked(mockAnalytics.getPostMetrics).mockRejectedValue(new Error('timeout'));

      await expect(
        controller.getPostMetrics({ postId: 'p-1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });
});
