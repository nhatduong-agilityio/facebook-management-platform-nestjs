import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { WorkspaceRole } from '../types/workspace-role.type';
import { IWorkspaceMemberRepository } from '../ports/workspace-member.repository.port';

/**
 * MikroORM adapter for `IWorkspaceMemberRepository`.
 *
 * Uses a raw SQL query against `core.workspace_members` because the table's
 * MikroORM entity is owned by the workspace module (created in T1.4). Raw SQL
 * is the correct choice here: no entity mapping exists yet, and cross-schema
 * references must not carry MikroORM relation metadata (BR-R06).
 *
 * This adapter will be relocated to the workspace module in T1.4 once the
 * `WorkspaceMember` entity is registered there.
 */
@Injectable()
export class MikroOrmWorkspaceMemberRepository extends IWorkspaceMemberRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** @inheritdoc */
  async findRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
    const rows = await this.em
      .getConnection()
      .execute<{ role: string }[]>(
        'SELECT role FROM core.workspace_members WHERE user_id = ? AND workspace_id = ? AND deleted_at IS NULL',
        [userId, workspaceId],
      );

    return rows.length === 0 ? null : (rows[0].role as WorkspaceRole);
  }
}
