import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { PostDeletedConsumer, type PostDeletedPayload } from './post-deleted.consumer';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

const makeMsg = (overrides: Partial<PostDeletedPayload> = {}): PostDeletedPayload => ({
  eventId: 'evt-005',
  postId: 'post-001',
  workspaceId: 'ws-001',
  deletedByUserId: 'user-001',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  deleteObject?: () => Promise<void>;
}) {
  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(opts.redisDel ?? (() => Promise.resolve(1))),
  } as unknown as import('ioredis').Redis;

  const algolia = {
    saveObject: vi.fn(),
    partialUpdateObject: vi.fn(),
    deleteObject: vi.fn(opts.deleteObject ?? (() => Promise.resolve())),
    search: vi.fn(),
  } as unknown as IAlgoliaSearchProvider;

  const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;
  const consumer = new PostDeletedConsumer(algolia, redis, logger);
  return { consumer, algolia, redis };
}

describe('PostDeletedConsumer', () => {
  it('deletes object from Algolia on happy path', async () => {
    const { consumer, algolia } = makeConsumer({});

    await consumer.onPostDeleted(makeMsg());

    expect(algolia.deleteObject).toHaveBeenCalledWith('post-001');
  });

  it('skips duplicate events (dedup)', async () => {
    const { consumer, algolia } = makeConsumer({ redisSet: () => Promise.resolve(null) });

    await consumer.onPostDeleted(makeMsg());

    expect(algolia.deleteObject).not.toHaveBeenCalled();
  });

  it('clears dedup key and rethrows when Algolia fails', async () => {
    const { consumer, redis } = makeConsumer({
      deleteObject: () => Promise.reject(new Error('algolia error')),
    });

    await expect(consumer.onPostDeleted(makeMsg())).rejects.toThrow('algolia error');
    expect(redis.del).toHaveBeenCalledWith('dedup:search:evt-005');
  });
});
