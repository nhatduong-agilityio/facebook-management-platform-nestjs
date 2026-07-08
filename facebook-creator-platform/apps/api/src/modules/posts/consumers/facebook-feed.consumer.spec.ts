import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { MikroORM } from '@mikro-orm/core';
import type { Logger } from 'nestjs-pino';
import { IEventBus } from '../../../common/events/event-bus.port';
import { FacebookFeedConsumer, type FacebookFeedPayload } from './facebook-feed.consumer';
import { PostPublishedEvent } from '../events/post-published.event';
import type { Post } from '../entities/post.entity';

const mockRedis = {
  set: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as unknown as Redis;

const mockEm = {
  findOne: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
};

const mockOrm = {
  em: { fork: vi.fn().mockReturnValue(mockEm) },
} as unknown as MikroORM;

const mockEventBus = {
  publish: vi.fn().mockResolvedValue(undefined),
} as unknown as IEventBus;

const mockLogger = { log: vi.fn() } as unknown as Logger;

const sampleMsg: FacebookFeedPayload = {
  eventId: 'evt-feed-001',
  facebookPostId: 'page-123_post-456',
  pageId: 'page-123',
  occurredAt: new Date().toISOString(),
};

describe('FacebookFeedConsumer', () => {
  let consumer: FacebookFeedConsumer;

  beforeEach(() => {
    consumer = new FacebookFeedConsumer(mockRedis, mockOrm, mockEventBus, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockOrm.em.fork).mockReturnValue(mockEm as never);
  });

  it('returns early without DB access when event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null); // NX failed — already seen

    await consumer.onFacebookFeed(sampleMsg);

    expect(mockEm.findOne).not.toHaveBeenCalled();
    expect(mockEventBus.publish).not.toHaveBeenCalled();
  });

  it('skips silently when no post matches facebookGraphPostId', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockEm.findOne).mockResolvedValue(null);

    await consumer.onFacebookFeed(sampleMsg);

    expect(mockEm.flush).not.toHaveBeenCalled();
    expect(mockEventBus.publish).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledOnce();
  });

  it('transitions post to published and emits PostPublishedEvent on the happy path', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const fakePost = {
      id: 'post-uuid-1',
      status: 'publishing',
      facebookGraphPostId: 'page-123_post-456',
      facebookAccount: { id: 'fa-uuid-1' },
      createdByUserId: 'user-uuid-1',
      workspace: { id: 'ws-uuid-1' },
      publishedAt: undefined as Date | undefined,
    } as unknown as Post;
    vi.mocked(mockEm.findOne).mockResolvedValue(fakePost);

    await consumer.onFacebookFeed(sampleMsg);

    expect(fakePost.status).toBe('published');
    expect(fakePost.publishedAt).toBeInstanceOf(Date);
    expect(mockEm.flush).toHaveBeenCalledOnce();
    expect(mockEventBus.publish).toHaveBeenCalledOnce();
    const published = vi.mocked(mockEventBus.publish).mock.calls[0][0];
    expect(published).toBeInstanceOf(PostPublishedEvent);
    expect((published as PostPublishedEvent).postId).toBe('post-uuid-1');
    expect((published as PostPublishedEvent).workspaceId).toBe('ws-uuid-1');
  });

  it('clears dedup key and rethrows on a transient error', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const transientError = new Error('DB connection lost');
    vi.mocked(mockEm.findOne).mockRejectedValue(transientError);

    await expect(consumer.onFacebookFeed(sampleMsg)).rejects.toThrow('DB connection lost');
    expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-feed-001');
  });
});
