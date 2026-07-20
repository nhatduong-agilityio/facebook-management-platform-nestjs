import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { FacebookAccount } from '../entities/facebook-account.entity';
import {
  IFacebookAccountRepository,
  type FacebookPageConnectData,
} from '../ports/facebook-account.repository.port';
import { Workspace } from '../../workspace/entities/workspace.entity';

/**
 * MikroORM adapter for `IFacebookAccountRepository`.
 *
 * Uses `em.getReference(Workspace, workspaceId)` to set the workspace FK
 * without issuing a SELECT — safe because the workspace existence is guaranteed
 * by `WorkspaceRolesGuard` at the controller layer.
 *
 * `connectPage` is an upsert: if a record for `pageId` already exists, its
 * token is refreshed. A single `em.flush()` closes the unit-of-work.
 */
@Injectable()
export class MikroOrmFacebookAccountRepository extends IFacebookAccountRepository {
  constructor(
    @InjectRepository(FacebookAccount)
    private readonly repo: EntityRepository<FacebookAccount>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  findById(id: string): Promise<FacebookAccount | null> {
    return this.repo.findOne({ id, deletedAt: null });
  }

  /** @inheritdoc */
  findByPageId(pageId: string): Promise<FacebookAccount | null> {
    return this.repo.findOne({ pageId, deletedAt: null });
  }

  /** @inheritdoc */
  findByIdAndWorkspace(id: string, workspaceId: string): Promise<FacebookAccount | null> {
    return this.repo.findOne({ id, workspace: workspaceId });
  }

  /** @inheritdoc */
  async save(_account: FacebookAccount): Promise<void> {
    await this.em.flush();
  }

  /** @inheritdoc */
  findAllByWorkspace(workspaceId: string): Promise<FacebookAccount[]> {
    return this.repo.find(
      { workspace: workspaceId, deletedAt: null },
      { orderBy: { connectedAt: 'DESC' } },
    );
  }

  /** @inheritdoc */
  async softDeleteAllByWorkspace(workspaceId: string): Promise<void> {
    const accounts = await this.repo.find({ workspace: workspaceId });
    const now = new Date();
    for (const account of accounts) {
      account.deletedAt = now;
    }
    // Caller owns the single em.flush() for the cascade (W-1, §6).
  }

  /** @inheritdoc */
  async connectPage(workspaceId: string, data: FacebookPageConnectData): Promise<FacebookAccount> {
    const existing = await this.repo.findOne({ pageId: data.pageId });

    if (existing) {
      existing.updateToken(data.accessToken, data.tokenExpiresAt);
      await this.em.flush();
      return existing;
    }

    const workspaceProxy = this.em.getReference(Workspace, workspaceId);
    const account = FacebookAccount.connect(
      workspaceProxy,
      data.pageId,
      data.pageName,
      data.accessToken,
      data.tokenExpiresAt,
    );
    this.em.persist(account);
    await this.em.flush();
    return account;
  }
}
