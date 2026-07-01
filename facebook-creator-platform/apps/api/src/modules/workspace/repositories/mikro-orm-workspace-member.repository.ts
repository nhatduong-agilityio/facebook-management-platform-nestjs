import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import { IWorkspaceMemberWriteRepository } from '../ports/workspace-member.repository.port';

/**
 * MikroORM adapter for `IWorkspaceMemberWriteRepository`.
 *
 * Stages `WorkspaceMember` entities into the Unit of Work for batch persistence.
 * Callers flush via `IWorkspaceRepository.save` so that workspace + membership
 * are committed in a single transaction.
 */
@Injectable()
export class MikroOrmWorkspaceMemberRepository extends IWorkspaceMemberWriteRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** @inheritdoc */
  persist(member: WorkspaceMember): void {
    this.em.persist(member);
  }
}
