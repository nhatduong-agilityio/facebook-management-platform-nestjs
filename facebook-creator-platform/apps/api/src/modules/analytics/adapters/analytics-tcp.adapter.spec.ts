import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { AnalyticsTcpAdapter } from './analytics-tcp.adapter';
import { DownstreamServiceError } from '../../../common/errors/downstream-service.error';
import type { MetricsSummaryDto, PostMetricsDayDto } from '../dto/analytics.dto';

const makeMetricsSummary = (): MetricsSummaryDto => ({
  reach: 1000,
  impressions: 4000,
  likes: 120,
  comments: 15,
  shares: 8,
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

describe('AnalyticsTcpAdapter', () => {
  let adapter: AnalyticsTcpAdapter;
  let client: ClientProxy;

  beforeEach(() => {
    client = { send: vi.fn() } as unknown as ClientProxy;
    adapter = new AnalyticsTcpAdapter(client);
  });

  // ---------------------------------------------------------------------------
  // getWorkspaceMetrics
  // ---------------------------------------------------------------------------

  describe('getWorkspaceMetrics', () => {
    it('returns MetricsSummaryDto from the analytics service', async () => {
      const summary = makeMetricsSummary();
      vi.mocked(client.send).mockReturnValue(of(summary));

      const result = await adapter.getWorkspaceMetrics('ws-1');

      expect(result).toEqual(summary);
      expect(client.send).toHaveBeenCalledWith('analytics.workspace-metrics', {
        workspaceId: 'ws-1',
      });
    });

    it('throws DownstreamServiceError(500) on RpcException', async () => {
      vi.mocked(client.send).mockReturnValue(
        throwError(() => new RpcException({ code: 'INTERNAL', message: 'DB error' })),
      );

      await expect(adapter.getWorkspaceMetrics('ws-1')).rejects.toMatchObject({ status: 500 });
    });

    it('throws DownstreamServiceError(503) on TCP connection failure', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await expect(adapter.getWorkspaceMetrics('ws-1')).rejects.toBeInstanceOf(
        DownstreamServiceError,
      );
      await expect(adapter.getWorkspaceMetrics('ws-1')).rejects.toMatchObject({ status: 503 });
    });
  });

  // ---------------------------------------------------------------------------
  // getPostMetrics
  // ---------------------------------------------------------------------------

  describe('getPostMetrics', () => {
    it('returns PostMetricsDayDto[] from the analytics service', async () => {
      const rows = makePostMetrics();
      vi.mocked(client.send).mockReturnValue(of(rows));

      const result = await adapter.getPostMetrics('post-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ postId: 'post-1', reach: 420 });
      expect(client.send).toHaveBeenCalledWith('analytics.post-metrics', { postId: 'post-1' });
    });

    it('returns an empty array when the service has no data', async () => {
      vi.mocked(client.send).mockReturnValue(of([]));

      const result = await adapter.getPostMetrics('post-no-data');

      expect(result).toEqual([]);
    });

    it('throws DownstreamServiceError(500) on RpcException', async () => {
      vi.mocked(client.send).mockReturnValue(
        throwError(() => new RpcException({ code: 'INTERNAL', message: 'Analytics service error' })),
      );

      await expect(adapter.getPostMetrics('post-1')).rejects.toMatchObject({ status: 500 });
    });

    it('throws DownstreamServiceError(503) on TCP timeout or connection error', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('timeout')));

      await expect(adapter.getPostMetrics('post-1')).rejects.toMatchObject({ status: 503 });
    });
  });
});
