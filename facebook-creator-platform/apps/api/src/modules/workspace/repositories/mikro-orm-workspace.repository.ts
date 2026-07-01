import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Workspace } from '../entities/workspace.entity';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import { IWorkspaceRepository } from '../ports/workspace.repository.port';

/**
 * MikroORM adapter for `IWorkspaceRepository`.
 *
 * All ORM-specific imports are confined here. The application layer (service)
 * depends only on the `IWorkspaceRepository` port.
 */
@Injectable()
export class MikroOrmWorkspaceRepository extends IWorkspaceRepository {
  constructor(
    @InjectRepository(Workspace) private readonly repo: EntityRepository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly memberRepo: EntityRepository<WorkspaceMember>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  findById(id: string): Promise<Workspace | null> {
    return this.repo.findOne({ id });
  }

  /**
   * Returns all active workspaces the user belongs to via their membership records.
   *
   * Two typed repository queries replace raw SQL: first resolve workspace ids from
   * `workspace_members`, then load the matching `Workspace` rows (the `softDelete`
   * filter on `BaseEntity` automatically excludes deleted workspaces).
   *
   * @inheritdoc
   */
  async findAllByUserId(userId: string): Promise<Workspace[]> {
    const memberships = await this.memberRepo.find({ userId }, { fields: ['workspaceId'] });
    if (memberships.length === 0) return [];

    return this.repo.find({ id: { $in: memberships.map((m) => m.workspaceId) } });
  }

  /** @inheritdoc */
  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo.count({ slug });
    return count > 0;
  }

  /**
   * Stages the workspace for insertion and flushes the Unit of Work.
   *
   * Uses a dedicated `flush` to commit the workspace + its owner membership
   * in one transaction. The caller is responsible for calling
   * `IWorkspaceMemberWriteRepository.persist` before this method.
   *
   * @inheritdoc
   */
  async save(workspace: Workspace): Promise<void> {
    this.em.persist(workspace);
    await this.em.flush();
  }
}
