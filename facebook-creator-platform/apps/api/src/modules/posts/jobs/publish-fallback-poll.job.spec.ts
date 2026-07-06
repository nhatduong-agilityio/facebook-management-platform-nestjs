import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { ConfigService } from '@nestjs/config';
import type { Logger } from 'nestjs-pino';
import { PublishFallbackPollJob } from './publish-fallback-poll.job';
import type { IFacebookGraphApiProvider } from '../../facebook/ports/facebook-graph-api.provider.port';
import type { IEventBus } from '../../../common/events/event-bus.port';
import type { Post } from '../entities/post.entity';
import { PostPublishedEvent } from '../events/post-published.event';
import { PostFailedEvent } from '../events/post-failed.event';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<Post> = {}): Post {
  const now = new Date();
  return {
    id: 'post-1',
    status: 'publishing',
    facebookGraphPostId: 'page-123_555',
    content: 'Hello',
    workspace: { id: 'ws-1' } as Post['workspace'],
    createdByUserId: 'user-1',
    // updatedAt 60 minutes ago — well past a 30-min TTL
    updatedAt: new Date(now.getTime() - 60 * 60 * 1000),
    publishedAt: undefined,
    lastError: undefined,
    facebookAccount: undefined,
    deletedAt: undefined,
    ...overrides,
  } as unknown as Post;
}

function makeAccount(id = 'acc-1') {
  return { id, pageId: 'page-123', accessToken: 'tok-abc' };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEm = {
  find: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
};

const mockOrm = {
  em: { fork: vi.fn().mockReturnValue(mockEm) },
} as unknown as MikroORM;

const mockConfig = {
  get: vi.fn().mockReturnValue(30),
} as unknown as ConfigService;

const mockGraphApi: IFacebookGraphApiProvider = {
  publishPost: vi.fn(),
  checkPostLive: vi.fn(),
  exchangeCodeForPages: vi.fn(),
  refreshPageToken: vi.fn(),
} as unknown as IFacebookGraphApiProvider;

const mockEventBus: IEventBus = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as IEventBus;

const mockLogger = {
  log: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublishFallbackPollJob', () => {
  let job: PublishFallbackPollJob;

  beforeEach(() => {
    job = new PublishFallbackPollJob(mockOrm, mockGraphApi, mockEventBus, mockConfig, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockOrm.em.fork).mockReturnValue(mockEm as never);
  });

  it('does nothing when no publishing posts are past the TTL', async () => {
    vi.mocked(mockEm.find).mockResolvedValue([]);

    await job.run();

    expect(mockGraphApi.checkPostLive).not.toHaveBeenCalled();
    expect(mockEm.flush).not.toHaveBeenCalled();
  });

  it('transitions to published and emits PostPublishedEvent when Graph API confirms live', async () => {
    const post = makePost();
    const account = makeAccount();
    post.facebookAccount = { getEntity: () => account } as unknown as Post['facebookAccount'];
    vi.mocked(mockEm.find).mockResolvedValue([post]);
    vi.mocked(mockGraphApi.checkPostLive).mockResolvedValue(true);

    await job.run();

    expect(post.status).toBe('published');
    expect(post.publishedAt).toBeInstanceOf(Date);
    expect(mockEm.flush).toHaveBeenCalledOnce();

    const event = vi.mocked(mockEventBus.publish).mock.calls[0][0] as PostPublishedEvent;
    expect(event).toBeInstanceOf(PostPublishedEvent);
    expect(event.postId).toBe('post-1');
    expect(event.facebookGraphPostId).toBe('page-123_555');
    expect(event.facebookAccountId).toBe('acc-1');
  });

  it('leaves post in publishing state when not live and within TTL×3', async () => {
    const now = new Date();
    // updatedAt is 40 min ago — past 30-min TTL (found by query) but within 90-min TTL×3
    const post = makePost({ updatedAt: new Date(now.getTime() - 40 * 60 * 1000) });
    const account = makeAccount();
    post.facebookAccount = { getEntity: () => account } as unknown as Post['facebookAccount'];
    vi.mocked(mockEm.find).mockResolvedValue([post]);
    vi.mocked(mockGraphApi.checkPostLive).mockResolvedValue(false);

    await job.run();

    expect(post.status).toBe('publishing');
    expect(mockEm.flush).not.toHaveBeenCalled();
    expect(mockEventBus.publish).not.toHaveBeenCalled();
  });

  it('transitions to failed and emits PostFailedEvent when not live beyond TTL×3', async () => {
    const now = new Date();
    // updatedAt is 100 min ago — past 90-min TTL×3
    const post = makePost({ updatedAt: new Date(now.getTime() - 100 * 60 * 1000) });
    const account = makeAccount();
    post.facebookAccount = { getEntity: () => account } as unknown as Post['facebookAccount'];
    vi.mocked(mockEm.find).mockResolvedValue([post]);
    vi.mocked(mockGraphApi.checkPostLive).mockResolvedValue(false);

    await job.run();

    expect(post.status).toBe('failed');
    expect(post.lastError).toContain('90 minutes');
    expect(mockEm.flush).toHaveBeenCalledOnce();

    const event = vi.mocked(mockEventBus.publish).mock.calls[0][0] as PostFailedEvent;
    expect(event).toBeInstanceOf(PostFailedEvent);
    expect(event.postId).toBe('post-1');
  });
});
