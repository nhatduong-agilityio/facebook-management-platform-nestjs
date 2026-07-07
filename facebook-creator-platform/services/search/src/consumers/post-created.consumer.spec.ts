import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { PostCreatedConsumer, type PostCreatedPayload } from './post-created.consumer';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

const makeMsg = (overrides: Partial<PostCreatedPayload> = {}): PostCreatedPayload => ({
  eventId: 'evt-001',
  postId: 'post-001',
  workspaceId: 'ws-001',
  createdByUserId: 'user-001',
  title: 'My post',
  content: 'Hello world',
  status: 'draft',
  scheduledAt: undefined,
  createdAt: '2026-07-07T00:00:00.000Z',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  saveObject?: () => Promise<void>;
}) {
  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(opts.redisDel ?? (() => Promise.resolve(1))),
  } as unknown as import('ioredis').Redis;

  const algolia = {
    saveObject: vi.fn(opts.saveObject ?? (() => Promise.resolve())),
    partialUpdateObject: vi.fn(),
    deleteObject: vi.fn(),
    search: vi.fn(),
  } as unknown as IAlgoliaSearchProvider;

  const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;
  const consumer = new PostCreatedConsumer(algolia, redis, logger);
  return { consumer, algolia, redis };
}

describe('PostCreatedConsumer', () => {
  it('saves object to Algolia on happy path', async () => {
    const { consumer, algolia } = makeConsumer({});

    await consumer.onPostCreated(makeMsg());

    expect(algolia.saveObject).toHaveBeenCalledWith(
      'post-001',
      expect.objectContaining({
        workspaceId: 'ws-001',
        content: 'Hello world',
        status: 'draft',
      }),
    );
  });

  it('skips duplicate events (dedup)', async () => {
    const { consumer, algolia } = makeConsumer({ redisSet: () => Promise.resolve(null) });

    await consumer.onPostCreated(makeMsg());

    expect(algolia.saveObject).not.toHaveBeenCalled();
  });

  it('clears dedup key and rethrows when Algolia fails', async () => {
    const { consumer, redis } = makeConsumer({
      saveObject: () => Promise.reject(new Error('algolia error')),
    });

    await expect(consumer.onPostCreated(makeMsg())).rejects.toThrow('algolia error');
    expect(redis.del).toHaveBeenCalledWith('dedup:search:evt-001');
  });
});
