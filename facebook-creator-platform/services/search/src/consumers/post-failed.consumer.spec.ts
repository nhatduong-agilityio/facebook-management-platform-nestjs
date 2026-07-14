import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { RmqContext } from '@nestjs/microservices';
import { PostFailedConsumer, type PostFailedPayload } from './post-failed.consumer';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

const makeMsg = (overrides: Partial<PostFailedPayload> = {}): PostFailedPayload => ({
  eventId: 'evt-004',
  postId: 'post-001',
  workspaceId: 'ws-001',
  createdByUserId: 'user-001',
  lastError: 'Graph API 400',
  occurredAt: '2026-07-07T03:00:00.000Z',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  partialUpdateObject?: () => Promise<void>;
}) {
  const mockChannel = { ack: vi.fn(), nack: vi.fn() };
  const mockMsg = {};
  const mockCtx = {
    getChannelRef: () => mockChannel,
    getMessage: () => mockMsg,
  } as unknown as RmqContext;

  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(opts.redisDel ?? (() => Promise.resolve(1))),
  } as unknown as import('ioredis').Redis;

  const algolia = {
    saveObject: vi.fn(),
    partialUpdateObject: vi.fn(opts.partialUpdateObject ?? (() => Promise.resolve())),
    deleteObject: vi.fn(),
    search: vi.fn(),
  } as unknown as IAlgoliaSearchProvider;

  const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;
  const consumer = new PostFailedConsumer(algolia, redis, logger);
  return { consumer, algolia, redis, mockChannel, mockMsg, mockCtx };
}

describe('PostFailedConsumer', () => {
  it('updates Algolia record to failed status on happy path', async () => {
    const { consumer, algolia, mockChannel, mockMsg, mockCtx } = makeConsumer({});

    await consumer.onPostFailed(makeMsg(), mockCtx);

    expect(algolia.partialUpdateObject).toHaveBeenCalledWith(
      'post-001',
      expect.objectContaining({
        status: 'failed',
        failedAt: '2026-07-07T03:00:00.000Z',
      }),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('skips duplicate events (dedup)', async () => {
    const { consumer, algolia, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.resolve(null),
    });

    await consumer.onPostFailed(makeMsg(), mockCtx);

    expect(algolia.partialUpdateObject).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('clears dedup key and nacks with requeue when Algolia fails', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      partialUpdateObject: () => Promise.reject(new Error('algolia error')),
    });

    await consumer.onPostFailed(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:search:evt-004');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
