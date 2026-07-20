import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository, type FilterQuery } from '@mikro-orm/core';
import { Post, type CreatePostData } from '../entities/post.entity';
import {
  IPostRepository,
  type ListPostsQuery,
  type PostsPage,
} from '../ports/post.repository.port';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { FacebookAccount } from '../../facebook/entities/facebook-account.entity';

/**
 * MikroORM adapter for `IPostRepository`.
 *
 * Uses `em.getReference()` to set FK relations without issuing SELECTs — safe because
 * `WorkspaceRolesGuard` has already verified workspace existence, and `createPost`
 * validates account ownership via `facebookAccountBelongsToWorkspace` first.
 *
 * `FacebookAccount` is imported directly here (§13 — cross-module entity access via
 * EntityManager) to avoid a circular NestJS module dependency between PostsModule
 * and FacebookModule.
 */
@Injectable()
export class MikroOrmPostRepository extends IPostRepository {
  constructor(
    @InjectRepository(Post)
    private readonly repo: EntityRepository<Post>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  findById(id: string, workspaceId: string): Promise<Post | null> {
    return this.repo.findOne({ id, workspace: workspaceId });
  }

  /** @inheritdoc */
  async findAll(workspaceId: string, query: ListPostsQuery = {}): Promise<PostsPage> {
    const limit = Math.min(query.limit ?? 50, 100);

    const where: FilterQuery<Post> = { workspace: workspaceId };

    if (query.cursor) {
      const raw = Buffer.from(query.cursor, 'base64url').toString('utf8');
      const { createdAt, id } = JSON.parse(raw) as { createdAt: string; id: string };
      const cursorDate = new Date(createdAt);
      // Keyset: rows strictly before (createdAt DESC, id DESC) of the cursor row.
      where.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, id: { $lt: id } },
      ];
    }

    // Fetch one extra row to determine whether a next page exists.
    const rows = await this.repo.find(where, {
      orderBy: { createdAt: 'DESC', id: 'DESC' },
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
          ).toString('base64url')
        : null;

    return { data, nextCursor };
  }

  /** @inheritdoc */
  countByWorkspace(workspaceId: string): Promise<number> {
    return this.repo.count({ workspace: workspaceId });
  }

  /** @inheritdoc */
  async facebookAccountBelongsToWorkspace(
    accountId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const count = await this.em.count(FacebookAccount, { id: accountId, workspace: workspaceId });
    return count > 0;
  }

  /** @inheritdoc */
  async createPost(
    workspaceId: string,
    facebookAccountId: string | null,
    createdByUserId: string,
    data: CreatePostData,
  ): Promise<Post> {
    const workspaceProxy = this.em.getReference(Workspace, workspaceId);
    const accountProxy = facebookAccountId
      ? this.em.getReference(FacebookAccount, facebookAccountId)
      : null;
    const post = Post.create(workspaceProxy, accountProxy, createdByUserId, data);
    this.em.persist(post);
    await this.em.flush();
    return post;
  }

  /** @inheritdoc */
  async save(_post: Post): Promise<void> {
    await this.em.flush();
  }

  /** @inheritdoc */
  async softDeleteNonTerminalByWorkspace(workspaceId: string): Promise<number> {
    const posts = await this.repo.find({
      workspace: workspaceId,
      status: { $in: ['draft', 'scheduled', 'publishing'] },
    });
    const now = new Date();
    for (const post of posts) {
      post.deletedAt = now;
    }
    // Caller owns the single em.flush() for the cascade (W-1, §6).
    return posts.length;
  }
}
