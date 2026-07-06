import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { Logger } from 'nestjs-pino';
import { PublishJob } from './publish.job';
import type { IFacebookGraphApiProvider } from '../../facebook/ports/facebook-graph-api.provider.port';
import type { IEventBus } from '../../../common/events/event-bus.port';
import type { Post } from '../entities/post.entity';
import { PostFailedEvent } from '../events/post-failed.event';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    status: 'scheduled',
    scheduledAt: new Date(Date.now() - 60_000),
    content: 'Hello, world!',
    mediaUrl: undefined,
    workspace: { id: 'ws-1' } as Post['workspace'],
    createdByUserId: 'user-1',
    facebookGraphPostId: undefined,
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

describe('PublishJob', () => {
  let job: PublishJob;

  beforeEach(() => {
    job = new PublishJob(mockOrm, mockGraphApi, mockEventBus, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockOrm.em.fork).mockReturnValue(mockEm as never);
  });

  it('does nothing when no posts are due', async () => {
    vi.mocked(mockEm.find).mockResolvedValue([]);

    await job.run();

    expect(mockGraphApi.publishPost).not.toHaveBeenCalled();
    expect(mockEm.flush).not.toHaveBeenCalled();
  });

  it('transitions a post to publishing and stores facebookGraphPostId on success', async () => {
    const post = makePost();
    const account = makeAccount();
    post.facebookAccount = { getEntity: () => account } as unknown as Post['facebookAccount'];
    vi.mocked(mockEm.find).mockResolvedValue([post]);
    vi.mocked(mockGraphApi.publishPost).mockResolvedValue({ postId: 'page-123_999' });

    await job.run();

    expect(post.status).toBe('publishing');
    expect(post.facebookGraphPostId).toBe('page-123_999');
    expect(mockEm.flush).toHaveBeenCalledOnce();
    expect(mockEventBus.publish).not.toHaveBeenCalled();
  });

  it('transitions a post to failed and emits PostFailedEvent on Graph API error', async () => {
    const post = makePost();
    const account = makeAccount();
    post.facebookAccount = { getEntity: () => account } as unknown as Post['facebookAccount'];
    vi.mocked(mockEm.find).mockResolvedValue([post]);
    vi.mocked(mockGraphApi.publishPost).mockRejectedValue(new Error('Graph API 400: bad request'));

    await job.run();

    expect(post.status).toBe('failed');
    expect(post.lastError).toBe('Graph API 400: bad request');
    expect(mockEm.flush).toHaveBeenCalledOnce();

    const event = vi.mocked(mockEventBus.publish).mock.calls[0][0] as PostFailedEvent;
    expect(event).toBeInstanceOf(PostFailedEvent);
    expect(event.postId).toBe('post-1');
    expect(event.workspaceId).toBe('ws-1');
  });

  it('transitions a post to failed and emits PostFailedEvent when no Facebook account is linked', async () => {
    const post = makePost({ facebookAccount: undefined });
    vi.mocked(mockEm.find).mockResolvedValue([post]);

    await job.run();

    expect(post.status).toBe('failed');
    expect(post.lastError).toContain('No Facebook account');
    expect(mockEm.flush).toHaveBeenCalledOnce();

    const event = vi.mocked(mockEventBus.publish).mock.calls[0][0] as PostFailedEvent;
    expect(event).toBeInstanceOf(PostFailedEvent);
  });
});
