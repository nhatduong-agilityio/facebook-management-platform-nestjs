import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { PostUpdatedConsumer, type PostUpdatedPayload } from './post-updated.consumer';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

const makeMsg = (overrides: Partial<PostUpdatedPayload> = {}): PostUpdatedPayload => ({
  eventId: 'evt-002',
  postId: 'post-001',
  workspaceId: 'ws-001',
  title: 'Updated title',
  content: 'Updated content',
  scheduledAt: undefined,
  updatedAt: '2026-07-07T01:00:00.000Z',
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
  const consumer = new PostUpdatedConsumer(algolia, redis, logger);
  return { consumer, algolia, redis };
}

describe('PostUpdatedConsumer', () => {
  it('partially updates Algolia record on happy path', async () => {
    const { consumer, algolia } = makeConsumer({});

    await consumer.onPostUpdated(makeMsg());

    expect(algolia.partialUpdateObject).toHaveBeenCalledWith(
      'post-001',
      expect.objectContaining({ updatedAt: '2026-07-07T01:00:00.000Z', title: 'Updated title' }),
    );
  });

  it('skips duplicate events (dedup)', async () => {
    const { consumer, algolia } = makeConsumer({ redisSet: () => Promise.resolve(null) });

    await consumer.onPostUpdated(makeMsg());

    expect(algolia.partialUpdateObject).not.toHaveBeenCalled();
  });

  it('clears dedup key and rethrows when Algolia fails', async () => {
    const { consumer, redis } = makeConsumer({
      partialUpdateObject: () => Promise.reject(new Error('algolia error')),
    });

    await expect(consumer.onPostUpdated(makeMsg())).rejects.toThrow('algolia error');
    expect(redis.del).toHaveBeenCalledWith('dedup:search:evt-002');
  });
});
