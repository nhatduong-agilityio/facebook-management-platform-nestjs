import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
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
  return { consumer, algolia, redis };
}

describe('PostFailedConsumer', () => {
  it('updates Algolia record to failed status on happy path', async () => {
    const { consumer, algolia } = makeConsumer({});

    await consumer.onPostFailed(makeMsg());

    expect(algolia.partialUpdateObject).toHaveBeenCalledWith(
      'post-001',
      expect.objectContaining({
        status: 'failed',
        failedAt: '2026-07-07T03:00:00.000Z',
      }),
    );
  });

  it('skips duplicate events (dedup)', async () => {
    const { consumer, algolia } = makeConsumer({ redisSet: () => Promise.resolve(null) });

    await consumer.onPostFailed(makeMsg());

    expect(algolia.partialUpdateObject).not.toHaveBeenCalled();
  });

  it('clears dedup key and rethrows when Algolia fails', async () => {
    const { consumer, redis } = makeConsumer({
      partialUpdateObject: () => Promise.reject(new Error('algolia error')),
    });

    await expect(consumer.onPostFailed(makeMsg())).rejects.toThrow('algolia error');
    expect(redis.del).toHaveBeenCalledWith('dedup:search:evt-004');
  });
});
