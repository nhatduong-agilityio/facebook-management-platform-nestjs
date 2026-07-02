import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { IEventBus } from '../../common/events/event-bus.port';
import { IPostRepository } from './ports/post.repository.port';
import { IPostQuotaProvider } from './ports/post-quota.provider.port';
import { PostCreatedEvent } from './events/post-created.event';
import { Post } from './entities/post.entity';
import { type CreatePostDto, type UpdatePostDto } from './dto/post.dto';

/**
 * Application service for `Post` CRUD operations.
 *
 * Depends only on abstract ports — no SDK, ORM, or ConfigService imports (§14).
 * All domain-level failures are returned as `Result<T, AppError>`; infrastructure
 * errors (DB, event bus) propagate as thrown exceptions (HTTP 500).
 *
 * Business rules enforced here:
 * - BR-F02: content length (1–63,206 chars) — also validated in DTO but checked here
 *   for belt-and-suspenders on any non-HTTP callers.
 * - PLAN_LIMIT_EXCEEDED: workspace is at its plan's post quota.
 * - BR-R05: `facebookAccountId`, when provided, must belong to the same workspace.
 * - Immutability: `published` and `publishing` posts cannot be updated.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly postRepo: IPostRepository,
    private readonly quotaProvider: IPostQuotaProvider,
    private readonly eventBus: IEventBus,
  ) {}

  /**
   * Creates a new post in `draft` status.
   *
   * Checks the workspace quota before persisting. If `facebookAccountId` is provided,
   * validates it belongs to the same workspace (BR-R05). Emits `PostCreatedEvent`
   * **after** `em.flush()` (§6).
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param userId      - UUID of the creating user.
   * @param dto         - Validated create payload.
   * @returns `ok(post)` on success, or:
   *   - `err(PLAN_LIMIT_EXCEEDED)` if the workspace is at quota.
   *   - `err(CROSS_WORKSPACE)` if `facebookAccountId` belongs to a different workspace.
   */
  async createPost(
    workspaceId: string,
    userId: string,
    dto: CreatePostDto,
  ): Promise<Result<Post, AppError>> {
    const [postCount, postLimit] = await Promise.all([
      this.postRepo.countByWorkspace(workspaceId),
      this.quotaProvider.getPostLimit(workspaceId),
    ]);

    if (postCount >= postLimit) {
      return err(
        new AppError(
          'PLAN_LIMIT_EXCEEDED',
          `Workspace has reached its post limit of ${postLimit}`,
          { workspaceId, postCount, postLimit },
        ),
      );
    }

    if (dto.facebookAccountId) {
      const belongs = await this.postRepo.facebookAccountBelongsToWorkspace(
        dto.facebookAccountId,
        workspaceId,
      );
      if (!belongs) {
        return err(
          new AppError(
            'CROSS_WORKSPACE',
            'FacebookAccount does not belong to this workspace (BR-R05)',
            { facebookAccountId: dto.facebookAccountId, workspaceId },
          ),
        );
      }
    }

    const post = await this.postRepo.createPost(
      workspaceId,
      dto.facebookAccountId ?? null,
      userId,
      {
        title: dto.title,
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    );

    await this.eventBus.publish(new PostCreatedEvent(post.id, workspaceId, userId));

    return ok(post);
  }

  /**
   * Returns all active (non-soft-deleted) posts for the workspace, newest first.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @returns `ok(posts)` — always succeeds (returns empty array if no posts).
   */
  async listPosts(workspaceId: string): Promise<Result<Post[], AppError>> {
    const posts = await this.postRepo.findAll(workspaceId);
    return ok(posts);
  }

  /**
   * Returns a single post by id, scoped to the workspace.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   * @returns `ok(post)` or `err(NOT_FOUND)` if missing or soft-deleted.
   */
  async getPost(workspaceId: string, postId: string): Promise<Result<Post, AppError>> {
    const post = await this.postRepo.findById(postId, workspaceId);
    if (!post) {
      return err(AppError.notFound('Post', { postId, workspaceId }));
    }
    return ok(post);
  }

  /**
   * Updates mutable fields on a `draft` or `scheduled` post.
   *
   * `published` and `publishing` posts are immutable via this endpoint.
   * Status transitions are handled exclusively by `PATCH /posts/:id/status` (T2.5).
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   * @param dto         - Fields to update (all optional).
   * @returns `ok(post)` on success, or:
   *   - `err(NOT_FOUND)` if the post does not exist.
   *   - `err(FORBIDDEN)` if the post is in a non-editable state.
   *   - `err(CROSS_WORKSPACE)` if the new `facebookAccountId` is foreign.
   */
  async updatePost(
    workspaceId: string,
    postId: string,
    dto: UpdatePostDto,
  ): Promise<Result<Post, AppError>> {
    const post = await this.postRepo.findById(postId, workspaceId);
    if (!post) {
      return err(AppError.notFound('Post', { postId, workspaceId }));
    }

    if (post.status === 'published' || post.status === 'publishing') {
      return err(
        AppError.forbidden(`Cannot edit a post in '${post.status}' state`),
      );
    }

    if (dto.facebookAccountId) {
      const belongs = await this.postRepo.facebookAccountBelongsToWorkspace(
        dto.facebookAccountId,
        workspaceId,
      );
      if (!belongs) {
        return err(
          new AppError(
            'CROSS_WORKSPACE',
            'FacebookAccount does not belong to this workspace (BR-R05)',
            { facebookAccountId: dto.facebookAccountId, workspaceId },
          ),
        );
      }
    }

    if (dto.title !== undefined) post.title = dto.title;
    if (dto.content !== undefined) post.content = dto.content;
    if (dto.mediaUrl !== undefined) post.mediaUrl = dto.mediaUrl;
    if (dto.scheduledAt !== undefined) post.scheduledAt = new Date(dto.scheduledAt);

    await this.postRepo.save(post);
    return ok(post);
  }

  /**
   * Soft-deletes a post by setting `deletedAt`.
   *
   * The post is immediately hidden from all queries by the default MikroORM
   * `softDelete` filter. Hard purges are performed by scheduled retention jobs only.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   * @returns `ok(undefined)` on success, or `err(NOT_FOUND)` if missing.
   */
  async deletePost(
    workspaceId: string,
    postId: string,
  ): Promise<Result<undefined, AppError>> {
    const post = await this.postRepo.findById(postId, workspaceId);
    if (!post) {
      return err(AppError.notFound('Post', { postId, workspaceId }));
    }

    post.deletedAt = new Date();
    await this.postRepo.save(post);
    return ok(undefined);
  }
}
