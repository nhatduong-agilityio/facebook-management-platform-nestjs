import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { IPostMetricsRepository } from './ports/post-metrics.repository.port';
import type { PostMetrics } from './entities/post-metrics.entity';

const makeRepo = (overrides: {
  aggregateByWorkspace?: () => Promise<import('./ports/post-metrics.repository.port').MetricsSummary>;
  findByPost?: () => Promise<PostMetrics[]>;
}) =>
  ({
    upsert: vi.fn(),
    findByPost: vi.fn(overrides.findByPost ?? (() => Promise.resolve([]))),
    aggregateByWorkspace: vi.fn(
      overrides.aggregateByWorkspace ??
        (() => Promise.resolve({ reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0 })),
    ),
  }) as unknown as IPostMetricsRepository;

describe('AnalyticsService', () => {
  it('returns aggregated workspace metrics', async () => {
    const summary = { reach: 500, impressions: 1000, likes: 50, comments: 20, shares: 10 };
    const repo = makeRepo({ aggregateByWorkspace: () => Promise.resolve(summary) });
    const service = new AnalyticsService(repo);

    const result = await service.getWorkspaceMetrics('ws-001');

    expect(result).toEqual(summary);
    expect(repo.aggregateByWorkspace).toHaveBeenCalledWith('ws-001');
  });

  it('returns zeros when workspace has no metrics', async () => {
    const repo = makeRepo({});
    const service = new AnalyticsService(repo);

    const result = await service.getWorkspaceMetrics('ws-empty');

    expect(result).toEqual({ reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0 });
  });

  it('returns daily metric rows for a post', async () => {
    const rows = [
      { id: '1', postId: 'post-001', reach: 100, impressions: 200 } as unknown as PostMetrics,
      { id: '2', postId: 'post-001', reach: 150, impressions: 300 } as unknown as PostMetrics,
    ];
    const repo = makeRepo({ findByPost: () => Promise.resolve(rows) });
    const service = new AnalyticsService(repo);

    const result = await service.getPostMetrics('post-001');

    expect(result).toHaveLength(2);
    expect(repo.findByPost).toHaveBeenCalledWith('post-001');
  });

  it('returns empty array for unknown post', async () => {
    const repo = makeRepo({ findByPost: () => Promise.resolve([]) });
    const service = new AnalyticsService(repo);

    const result = await service.getPostMetrics('post-unknown');

    expect(result).toEqual([]);
  });
});
