import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import { IWorkspaceMemberRepository } from '../ports/workspace-member.repository.port';

/**
 * MikroORM adapter for `IWorkspaceMemberRepository`.
 *
 * Filters on `workspace` use the `@ManyToOne` relation property directly —
 * MikroORM translates `{ workspace: workspaceId }` to `WHERE workspace_id = ?`.
 */
@Injectable()
export class MikroOrmWorkspaceMemberRepository extends IWorkspaceMemberRepository {
  constructor(
    @InjectRepository(WorkspaceMember) private readonly repo: EntityRepository<WorkspaceMember>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  persist(member: WorkspaceMember): void {
    this.em.persist(member);
  }

  /** @inheritdoc */
  findByWorkspaceAndId(workspaceId: string, memberId: string): Promise<WorkspaceMember | null> {
    return this.repo.findOne({ workspace: workspaceId, id: memberId });
  }

  /** @inheritdoc */
  countOwners(workspaceId: string): Promise<number> {
    return this.repo.count({ workspace: workspaceId, role: 'owner' });
  }

  /** @inheritdoc */
  findAllByWorkspaceId(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.repo.find({ workspace: workspaceId }, { orderBy: { joinedAt: 'ASC' } });
  }

  /** @inheritdoc */
  async remove(member: WorkspaceMember): Promise<void> {
    this.em.remove(member);
    await this.em.flush();
  }
}
