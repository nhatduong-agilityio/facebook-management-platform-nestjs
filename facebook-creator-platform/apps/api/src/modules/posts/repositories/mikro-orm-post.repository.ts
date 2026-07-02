import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Post, type CreatePostData } from '../entities/post.entity';
import { IPostRepository } from '../ports/post.repository.port';
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
  findAll(workspaceId: string): Promise<Post[]> {
    return this.repo.findAll({
      where: { workspace: workspaceId },
      orderBy: { createdAt: 'DESC' },
    });
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
}
