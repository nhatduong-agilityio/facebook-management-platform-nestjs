import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { PostPublishedConsumer } from './analytics.consumer';
import { IPostMetricsRepository } from './ports/post-metrics.repository.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { IFacebookInsightsProvider } from './ports/facebook-insights.provider.port';

const makeMsg = (overrides: Partial<{
  eventId: string;
  postId: string;
  workspaceId: string;
  facebookGraphPostId: string;
  facebookAccountId: string;
}> = {}) => ({
  eventId: 'evt-001',
  postId: 'post-001',
  workspaceId: 'ws-001',
  facebookGraphPostId: '123_456',
  facebookAccountId: 'acct-001',
  ...overrides,
});

const fakeInsights = { reach: 100, impressions: 200, likes: 10, comments: 5, shares: 3 };

function makeConsumer(overrides: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  getFacebookAccount?: () => Promise<{ id: string; pageToken: string }>;
  getPostInsights?: () => Promise<typeof fakeInsights>;
  upsert?: () => Promise<void>;
}) {
  const redis = {
    set: vi.fn(overrides.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(overrides.redisDel ?? (() => Promise.resolve(1))),
  } as unknown as import('ioredis').Redis;

  const metricsRepo = {
    upsert: vi.fn(overrides.upsert ?? (() => Promise.resolve())),
    findByPost: vi.fn(),
    aggregateByWorkspace: vi.fn(),
  } as unknown as IPostMetricsRepository;

  const internalApi = {
    getFacebookAccount: vi.fn(
      overrides.getFacebookAccount ?? (() => Promise.resolve({ id: 'acct-001', pageToken: 'tok-xyz' })),
    ),
  } as unknown as IInternalApiClient;

  const insightsProvider = {
    getPostInsights: vi.fn(overrides.getPostInsights ?? (() => Promise.resolve(fakeInsights))),
  } as unknown as IFacebookInsightsProvider;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  const consumer = new PostPublishedConsumer(metricsRepo, internalApi, insightsProvider, redis, logger);

  return { consumer, redis, metricsRepo, internalApi, insightsProvider, logger };
}

describe('PostPublishedConsumer', () => {
  it('upserts metrics on happy path', async () => {
    const { consumer, metricsRepo, internalApi, insightsProvider } = makeConsumer({});
    const msg = makeMsg();

    await consumer.onPostPublished(msg);

    expect(internalApi.getFacebookAccount).toHaveBeenCalledWith('acct-001');
    expect(insightsProvider.getPostInsights).toHaveBeenCalledWith('123_456', 'tok-xyz');
    expect(metricsRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'post-001',
        workspaceId: 'ws-001',
        reach: 100,
        impressions: 200,
      }),
    );
  });

  it('skips duplicate events (dedup)', async () => {
    const { consumer, metricsRepo, internalApi } = makeConsumer({
      redisSet: () => Promise.resolve(null), // NX failed → already processed
    });

    await consumer.onPostPublished(makeMsg());

    expect(internalApi.getFacebookAccount).not.toHaveBeenCalled();
    expect(metricsRepo.upsert).not.toHaveBeenCalled();
  });

  it('clears dedup key and rethrows when internal API fails', async () => {
    const { consumer, redis } = makeConsumer({
      getFacebookAccount: () => Promise.reject(new Error('network error')),
    });

    await expect(consumer.onPostPublished(makeMsg())).rejects.toThrow('network error');
    expect(redis.del).toHaveBeenCalledWith('dedup:analytics:evt-001');
  });

  it('clears dedup key and rethrows when Graph API insights fail', async () => {
    const { consumer, redis } = makeConsumer({
      getPostInsights: () => Promise.reject(new Error('graph error')),
    });

    await expect(consumer.onPostPublished(makeMsg())).rejects.toThrow('graph error');
    expect(redis.del).toHaveBeenCalledWith('dedup:analytics:evt-001');
  });

  it('clears dedup key and rethrows when upsert fails', async () => {
    const { consumer, redis } = makeConsumer({
      upsert: () => Promise.reject(new Error('db error')),
    });

    await expect(consumer.onPostPublished(makeMsg())).rejects.toThrow('db error');
    expect(redis.del).toHaveBeenCalledWith('dedup:analytics:evt-001');
  });
});
