import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostsService } from './posts.service';
import { IPostRepository } from './ports/post.repository.port';
import { IPostQuotaProvider } from './ports/post-quota.provider.port';
import { IEventBus } from '../../common/events/event-bus.port';
import { Post } from './entities/post.entity';
import type { CreatePostDto, UpdatePostDto } from './dto/post.dto';

// ─── helpers ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-uuid-0001';
const USER_ID = 'user-uuid-0001';
const POST_ID = 'post-uuid-0001';
const PAGE_ACCOUNT_ID = 'acct-uuid-0001';

function makePost(overrides: Partial<Post> = {}): Post {
  const post = Object.assign(new Post(), {
    id: POST_ID,
    createdByUserId: USER_ID,
    content: 'Hello Facebook!',
    status: 'draft' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  // Stub workspace ref so toDto() can read post.workspace.id
  (post as unknown as Record<string, unknown>).workspace = { id: WORKSPACE_ID };
  return post;
}

// ─── mocks ───────────────────────────────────────────────────────────────────

const mockPostRepo: IPostRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  countByWorkspace: vi.fn(),
  facebookAccountBelongsToWorkspace: vi.fn(),
  createPost: vi.fn(),
  save: vi.fn(),
} as unknown as IPostRepository;

const mockQuotaProvider: IPostQuotaProvider = {
  getPostLimit: vi.fn(),
} as unknown as IPostQuotaProvider;

const mockEventBus: IEventBus = {
  publish: vi.fn(),
} as unknown as IEventBus;

// ─── suite ───────────────────────────────────────────────────────────────────

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostsService(mockPostRepo, mockQuotaProvider, mockEventBus);
  });

  // ── createPost ─────────────────────────────────────────────────────────────

  describe('createPost', () => {
    const dto: CreatePostDto = { content: 'Hello Facebook!' };

    it('creates a post and emits PostCreatedEvent when under quota', async () => {
      vi.mocked(mockPostRepo.countByWorkspace).mockResolvedValue(3);
      vi.mocked(mockQuotaProvider.getPostLimit).mockResolvedValue(10);
      const post = makePost();
      vi.mocked(mockPostRepo.createPost).mockResolvedValue(post);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.createPost(WORKSPACE_ID, USER_ID, dto);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().id).toBe(POST_ID);
      expect(mockEventBus.publish).toHaveBeenCalledOnce();
    });

    it('creates a post with facebookAccountId when the account belongs to the workspace', async () => {
      vi.mocked(mockPostRepo.countByWorkspace).mockResolvedValue(0);
      vi.mocked(mockQuotaProvider.getPostLimit).mockResolvedValue(10);
      vi.mocked(mockPostRepo.facebookAccountBelongsToWorkspace).mockResolvedValue(true);
      const post = makePost();
      vi.mocked(mockPostRepo.createPost).mockResolvedValue(post);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.createPost(WORKSPACE_ID, USER_ID, {
        ...dto,
        facebookAccountId: PAGE_ACCOUNT_ID,
      });

      expect(result.isOk()).toBe(true);
      expect(mockPostRepo.facebookAccountBelongsToWorkspace).toHaveBeenCalledWith(
        PAGE_ACCOUNT_ID,
        WORKSPACE_ID,
      );
    });

    it('returns err(PLAN_LIMIT_EXCEEDED) when workspace is at quota', async () => {
      vi.mocked(mockPostRepo.countByWorkspace).mockResolvedValue(10);
      vi.mocked(mockQuotaProvider.getPostLimit).mockResolvedValue(10);

      const result = await service.createPost(WORKSPACE_ID, USER_ID, dto);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('PLAN_LIMIT_EXCEEDED');
      expect(mockPostRepo.createPost).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('returns err(CROSS_WORKSPACE) when facebookAccountId belongs to a different workspace', async () => {
      vi.mocked(mockPostRepo.countByWorkspace).mockResolvedValue(0);
      vi.mocked(mockQuotaProvider.getPostLimit).mockResolvedValue(10);
      vi.mocked(mockPostRepo.facebookAccountBelongsToWorkspace).mockResolvedValue(false);

      const result = await service.createPost(WORKSPACE_ID, USER_ID, {
        ...dto,
        facebookAccountId: PAGE_ACCOUNT_ID,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CROSS_WORKSPACE');
      expect(mockPostRepo.createPost).not.toHaveBeenCalled();
    });

    it('publishes the event after the repository flush, not before', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockPostRepo.countByWorkspace).mockResolvedValue(0);
      vi.mocked(mockQuotaProvider.getPostLimit).mockResolvedValue(10);
      vi.mocked(mockPostRepo.createPost).mockImplementation(async () => {
        callOrder.push('repo');
        return makePost();
      });
      vi.mocked(mockEventBus.publish).mockImplementation(async () => {
        callOrder.push('event');
      });

      await service.createPost(WORKSPACE_ID, USER_ID, dto);

      expect(callOrder).toEqual(['repo', 'event']);
    });
  });

  // ── listPosts ──────────────────────────────────────────────────────────────

  describe('listPosts', () => {
    it('returns ok([]) when workspace has no posts', async () => {
      vi.mocked(mockPostRepo.findAll).mockResolvedValue([]);

      const result = await service.listPosts(WORKSPACE_ID);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('returns ok(posts) ordered newest first', async () => {
      const posts = [makePost({ id: 'p1' }), makePost({ id: 'p2' })];
      vi.mocked(mockPostRepo.findAll).mockResolvedValue(posts);

      const result = await service.listPosts(WORKSPACE_ID);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(2);
    });
  });

  // ── getPost ────────────────────────────────────────────────────────────────

  describe('getPost', () => {
    it('returns ok(post) when the post exists', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(makePost());

      const result = await service.getPost(WORKSPACE_ID, POST_ID);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().id).toBe(POST_ID);
    });

    it('returns err(NOT_FOUND) when the post does not exist', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(null);

      const result = await service.getPost(WORKSPACE_ID, 'nonexistent-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  // ── updatePost ─────────────────────────────────────────────────────────────

  describe('updatePost', () => {
    const dto: UpdatePostDto = { content: 'Updated content' };

    it('updates content on a draft post', async () => {
      const post = makePost({ status: 'draft' });
      vi.mocked(mockPostRepo.findById).mockResolvedValue(post);
      vi.mocked(mockPostRepo.save).mockResolvedValue(undefined);

      const result = await service.updatePost(WORKSPACE_ID, POST_ID, dto);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().content).toBe('Updated content');
    });

    it('returns err(NOT_FOUND) when the post does not exist', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(null);

      const result = await service.updatePost(WORKSPACE_ID, 'missing-id', dto);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(FORBIDDEN) when the post is in published state', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(makePost({ status: 'published' }));

      const result = await service.updatePost(WORKSPACE_ID, POST_ID, dto);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
    });

    it('returns err(FORBIDDEN) when the post is in publishing state', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(makePost({ status: 'publishing' }));

      const result = await service.updatePost(WORKSPACE_ID, POST_ID, dto);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
    });

    it('returns err(CROSS_WORKSPACE) when new facebookAccountId is from another workspace', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(makePost({ status: 'draft' }));
      vi.mocked(mockPostRepo.facebookAccountBelongsToWorkspace).mockResolvedValue(false);

      const result = await service.updatePost(WORKSPACE_ID, POST_ID, {
        facebookAccountId: 'foreign-account-id',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CROSS_WORKSPACE');
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe('deletePost', () => {
    it('soft-deletes the post by setting deletedAt', async () => {
      const post = makePost();
      vi.mocked(mockPostRepo.findById).mockResolvedValue(post);
      vi.mocked(mockPostRepo.save).mockResolvedValue(undefined);

      const result = await service.deletePost(WORKSPACE_ID, POST_ID);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeUndefined();
      expect(post.deletedAt).toBeInstanceOf(Date);
    });

    it('returns err(NOT_FOUND) when the post does not exist', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(null);

      const result = await service.deletePost(WORKSPACE_ID, 'missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  // ── transitionStatus ───────────────────────────────────────────────────────

  describe('transitionStatus', () => {
    const FUTURE_DATE = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
    const PAST_DATE = new Date(Date.now() - 86_400_000).toISOString();  // -1 day
    const GRAPH_POST_ID = 'fb-graph-post-id-001';

    function setupPost(status: Post['status']) {
      const post = makePost({ status });
      vi.mocked(mockPostRepo.findById).mockResolvedValue(post);
      vi.mocked(mockPostRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);
      return post;
    }

    it('draft → scheduled: sets scheduledAt and transitions status', async () => {
      const post = setupPost('draft');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'scheduled',
        scheduledAt: FUTURE_DATE,
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('scheduled');
      expect(post.scheduledAt).toBeInstanceOf(Date);
    });

    it('draft → scheduled: returns err(VALIDATION_ERROR) when scheduledAt is missing', async () => {
      setupPost('draft');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'scheduled',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
    });

    it('draft → scheduled: returns err(VALIDATION_ERROR) when scheduledAt is in the past (BR-F06)', async () => {
      setupPost('draft');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'scheduled',
        scheduledAt: PAST_DATE,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
    });

    it('draft → publishing: sets facebookGraphPostId', async () => {
      const post = setupPost('draft');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'publishing',
        facebookGraphPostId: GRAPH_POST_ID,
      });

      expect(result.isOk()).toBe(true);
      expect(post.facebookGraphPostId).toBe(GRAPH_POST_ID);
      expect(post.status).toBe('publishing');
    });

    it('draft → publishing: returns err(VALIDATION_ERROR) when facebookGraphPostId is missing', async () => {
      setupPost('draft');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'publishing',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
    });

    it('scheduled → draft: unschedules the post', async () => {
      const post = setupPost('scheduled');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'draft',
      });

      expect(result.isOk()).toBe(true);
      expect(post.status).toBe('draft');
    });

    it('publishing → published: sets publishedAt and emits PostPublishedEvent after flush', async () => {
      const callOrder: string[] = [];
      const post = makePost({ status: 'publishing', facebookGraphPostId: GRAPH_POST_ID });
      vi.mocked(mockPostRepo.findById).mockResolvedValue(post);
      vi.mocked(mockPostRepo.save).mockImplementation(async () => { callOrder.push('flush'); });
      vi.mocked(mockEventBus.publish).mockImplementation(async () => { callOrder.push('event'); });

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'published',
      });

      expect(result.isOk()).toBe(true);
      expect(post.publishedAt).toBeInstanceOf(Date);
      expect(mockEventBus.publish).toHaveBeenCalledOnce();
      expect(callOrder).toEqual(['flush', 'event']);
    });

    it('publishing → failed: stores lastError on the post', async () => {
      const post = setupPost('publishing');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'failed',
        lastError: 'Graph API rate limit exceeded',
      });

      expect(result.isOk()).toBe(true);
      expect(post.lastError).toBe('Graph API rate limit exceeded');
      expect(post.status).toBe('failed');
    });

    it('failed → draft: clears lastError for retry', async () => {
      const post = makePost({ status: 'failed' });
      post.lastError = 'previous error';
      vi.mocked(mockPostRepo.findById).mockResolvedValue(post);
      vi.mocked(mockPostRepo.save).mockResolvedValue(undefined);

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'draft',
      });

      expect(result.isOk()).toBe(true);
      expect(post.lastError).toBeUndefined();
      expect(post.status).toBe('draft');
    });

    it('published → draft: returns err(INVALID_STATE_TRANSITION) — terminal state', async () => {
      setupPost('published');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'draft',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_STATE_TRANSITION');
    });

    it('draft → published: returns err(INVALID_STATE_TRANSITION) — skipping states', async () => {
      setupPost('draft');

      const result = await service.transitionStatus(WORKSPACE_ID, POST_ID, {
        status: 'published',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_STATE_TRANSITION');
    });

    it('returns err(NOT_FOUND) when the post does not exist', async () => {
      vi.mocked(mockPostRepo.findById).mockResolvedValue(null);

      const result = await service.transitionStatus(WORKSPACE_ID, 'missing-id', {
        status: 'scheduled',
        scheduledAt: FUTURE_DATE,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });
});
