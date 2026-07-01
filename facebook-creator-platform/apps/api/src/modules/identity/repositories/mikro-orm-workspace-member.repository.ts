import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { WorkspaceRole } from '../types/workspace-role.type';
import { IWorkspaceMemberRepository } from '../ports/workspace-member.repository.port';
import { WorkspaceMember } from '../../workspace/entities/workspace-member.entity';

/**
 * MikroORM adapter for `IWorkspaceMemberRepository`.
 *
 * Imports `WorkspaceMember` as a plain entity class (not via `@InjectRepository`)
 * so that `EntityManager.findOne` can query it without registering the entity in
 * this module's `MikroOrmModule.forFeature`. This avoids a circular NestJS module
 * dependency: `IdentityModule` exports guards consumed by `WorkspaceModule`, and
 * importing `WorkspaceModule` here would close the cycle. An entity-class import
 * is a TypeScript file dependency only — no NestJS module coupling.
 */
@Injectable()
export class MikroOrmWorkspaceMemberRepository extends IWorkspaceMemberRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** @inheritdoc */
  async findRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
    const member = await this.em.findOne(WorkspaceMember, { userId, workspaceId });
    return member ? member.role : null;
  }
}
