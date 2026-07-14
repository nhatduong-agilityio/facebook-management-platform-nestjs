import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { PostPublishedConsumer } from './analytics.consumer';
import { IPostMetricsRepository } from './ports/post-metrics.repository.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { IFacebookInsightsProvider } from './ports/facebook-insights.provider.port';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

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
  const mockChannel = { ack: vi.fn(), nack: vi.fn() };
  const mockMsg = {};
  const mockCtx = {
    getChannelRef: () => mockChannel,
    getMessage: () => mockMsg,
  } as unknown as RmqContext;

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

  const orm = { em: {} } as unknown as MikroORM;

  const consumer = new PostPublishedConsumer(
    orm, metricsRepo, internalApi, insightsProvider, redis, logger,
  );

  return { consumer, redis, metricsRepo, internalApi, insightsProvider, logger, mockChannel, mockMsg, mockCtx };
}

describe('PostPublishedConsumer', () => {
  it('upserts metrics on happy path and acks', async () => {
    const { consumer, metricsRepo, internalApi, insightsProvider, mockChannel, mockMsg, mockCtx } = makeConsumer({});

    await consumer.onPostPublished(makeMsg(), mockCtx);

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
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('acks and skips duplicate events (dedup)', async () => {
    const { consumer, metricsRepo, internalApi, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.resolve(null),
    });

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(internalApi.getFacebookAccount).not.toHaveBeenCalled();
    expect(metricsRepo.upsert).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('clears dedup key and nacks with requeue when internal API fails', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      getFacebookAccount: () => Promise.reject(new Error('network error')),
    });

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:analytics:evt-001');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('clears dedup key and nacks with requeue when Graph API insights fail', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      getPostInsights: () => Promise.reject(new Error('graph error')),
    });

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:analytics:evt-001');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('clears dedup key and nacks with requeue when upsert fails', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      upsert: () => Promise.reject(new Error('db error')),
    });

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:analytics:evt-001');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
