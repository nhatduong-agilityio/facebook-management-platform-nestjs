import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { AppError } from '../../common/errors/app-error';
import type { Post } from './entities/post.entity';
import type { User } from '../identity/entities/user.entity';

/** Minimal Post stub — only the fields the controller mapper reads. */
const makePost = (overrides: Record<string, unknown> = {}): Post =>
  ({
    id: 'post-1',
    workspace: { id: 'ws-1' },
    facebookAccount: undefined,
    createdByUserId: 'user-1',
    title: 'Draft Post',
    content: 'Hello Facebook',
    mediaUrl: undefined,
    status: 'draft',
    facebookGraphPostId: undefined,
    scheduledAt: undefined,
    publishedAt: undefined,
    lastError: undefined,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as Post;

const mockUser: User = { id: 'user-1' } as User;

describe('PostsController', () => {
  let controller: PostsController;
  let service: PostsService;

  beforeEach(() => {
    service = {
      createPost: vi.fn(),
      listPosts: vi.fn(),
      getPost: vi.fn(),
      updatePost: vi.fn(),
      deletePost: vi.fn(),
      transitionStatus: vi.fn(),
    } as unknown as PostsService;
    controller = new PostsController(service);
  });

  describe('createPost', () => {
    it('returns a PostResponseDto on success', async () => {
      vi.mocked(service.createPost).mockResolvedValue(ok(makePost()));

      const result = await controller.createPost('ws-1', mockUser, {
        content: 'Hello Facebook',
      } as never);

      expect(service.createPost).toHaveBeenCalledWith('ws-1', 'user-1', expect.any(Object));
      expect(result.id).toBe('post-1');
      expect(result.status).toBe('draft');
    });

    it('throws 409 when the post quota is exceeded', async () => {
      vi.mocked(service.createPost).mockResolvedValue(
        err(new AppError('PLAN_LIMIT_EXCEEDED', 'Post quota reached')),
      );

      await expect(
        controller.createPost('ws-1', mockUser, { content: 'x' } as never),
      ).rejects.toMatchObject({ response: { code: 'PLAN_LIMIT_EXCEEDED' } });
    });
  });

  describe('listPosts', () => {
    it('returns an array of PostResponseDtos', async () => {
      vi.mocked(service.listPosts).mockResolvedValue(ok([makePost(), makePost({ id: 'post-2' })]));

      const result = await controller.listPosts('ws-1');

      expect(result).toHaveLength(2);
    });

    it('returns an empty array when there are no posts', async () => {
      vi.mocked(service.listPosts).mockResolvedValue(ok([]));

      const result = await controller.listPosts('ws-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getPost', () => {
    it('returns a single post by id', async () => {
      vi.mocked(service.getPost).mockResolvedValue(ok(makePost()));

      const result = await controller.getPost('ws-1', 'post-1');

      expect(service.getPost).toHaveBeenCalledWith('ws-1', 'post-1');
      expect(result.id).toBe('post-1');
    });

    it('throws 404 when the post does not exist', async () => {
      vi.mocked(service.getPost).mockResolvedValue(err(AppError.notFound('Post')));

      await expect(controller.getPost('ws-1', 'missing')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('updatePost', () => {
    it('returns the updated post', async () => {
      const updated = makePost({ title: 'Updated' });
      vi.mocked(service.updatePost).mockResolvedValue(ok(updated));

      const result = await controller.updatePost('ws-1', 'post-1', { title: 'Updated' } as never);

      expect(result.title).toBe('Updated');
    });

    it('throws 403 when the post is not editable (published)', async () => {
      vi.mocked(service.updatePost).mockResolvedValue(err(AppError.forbidden('Post is not editable')));

      await expect(
        controller.updatePost('ws-1', 'post-1', {} as never),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    });
  });

  describe('deletePost', () => {
    it('resolves without error on success', async () => {
      vi.mocked(service.deletePost).mockResolvedValue(ok(undefined));

      await expect(controller.deletePost('ws-1', 'post-1')).resolves.toBeUndefined();
    });

    it('throws 404 when the post does not exist', async () => {
      vi.mocked(service.deletePost).mockResolvedValue(err(AppError.notFound('Post')));

      await expect(controller.deletePost('ws-1', 'missing')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('transitionStatus', () => {
    it('returns the post with the new status', async () => {
      const scheduled = makePost({ status: 'scheduled' });
      vi.mocked(service.transitionStatus).mockResolvedValue(ok(scheduled));

      const result = await controller.transitionStatus('ws-1', 'post-1', {
        status: 'scheduled',
      } as never);

      expect(result.status).toBe('scheduled');
    });

    it('throws 409 on invalid state transition', async () => {
      vi.mocked(service.transitionStatus).mockResolvedValue(
        err(new AppError('INVALID_STATE_TRANSITION', 'Cannot go from published to draft')),
      );

      await expect(
        controller.transitionStatus('ws-1', 'post-1', { status: 'draft' } as never),
      ).rejects.toMatchObject({ response: { code: 'INVALID_STATE_TRANSITION' } });
    });
  });
});
