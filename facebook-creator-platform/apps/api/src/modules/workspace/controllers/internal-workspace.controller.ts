import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { InternalSecretGuard } from '../../../common/guards/internal-secret.guard';
import { IWorkspaceMemberRepository } from '../ports/workspace-member.repository.port';
import { IWorkspaceRepository } from '../ports/workspace.repository.port';
import { User } from '../../identity/entities/user.entity';

/**
 * Internal HTTP endpoint for workspace member resolution (ADR-050).
 *
 * **Not** Swagger-documented. **Not** Clerk-authenticated.
 * Protected only by `InternalSecretGuard` (`x-internal-secret` header).
 *
 * Consumed by `services/notification` on boot for cold-start reconciliation
 * of `workspace_members_projection` (ADR-059).
 */
@Controller('internal/workspaces')
@UseGuards(InternalSecretGuard)
export class InternalWorkspaceController {
  /**
   * @param members    - Repository for `WorkspaceMember` lookups.
   * @param workspaces - Repository for `Workspace` lookups.
   * @param em         - MikroORM `EntityManager` for cross-module user lookup (§13).
   */
  constructor(
    private readonly members: IWorkspaceMemberRepository,
    private readonly workspaces: IWorkspaceRepository,
    private readonly em: EntityManager,
  ) {}

  /**
   * Returns the workspace owner's id and email address.
   *
   * Used by `services/email` to resolve the recipient email when a billing or
   * token-expiry event targets the workspace owner (ADR-050).
   *
   * @param id - UUID of the workspace.
   * @returns `{ id, ownerId, ownerEmail }` — 404 when workspace does not exist.
   */
  @Get(':id')
  async getWorkspace(
    @Param('id') id: string,
  ): Promise<{ id: string; ownerId: string; ownerEmail: string }> {
    const workspace = await this.workspaces.findById(id);
    if (!workspace) throw new NotFoundException(`Workspace ${id} not found`);

    const owner = await this.em.findOne(User, { id: workspace.ownerUserId });
    return {
      id: workspace.id,
      ownerId: workspace.ownerUserId,
      ownerEmail: owner?.email ?? '',
    };
  }

  /**
   * Returns all active members of a workspace with their roles.
   *
   * Used by the Notification Service during cold-start reconciliation to
   * re-upsert `workspace_members_projection` rows missed during downtime.
   *
   * @param id - UUID of the workspace.
   * @returns Array of `{ userId, role }` for each workspace member.
   */
  @Get(':id/members')
  async getMembers(
    @Param('id') id: string,
  ): Promise<{ userId: string; role: string }[]> {
    const rows = await this.members.findAllByWorkspaceId(id);
    return rows.map((m) => ({ userId: m.userId, role: m.role }));
  }
}
