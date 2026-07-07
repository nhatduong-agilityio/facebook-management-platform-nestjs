import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../../../common/guards/internal-secret.guard';
import { IWorkspaceMemberRepository } from '../ports/workspace-member.repository.port';

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
  /** @param members - Repository for `WorkspaceMember` lookups. */
  constructor(private readonly members: IWorkspaceMemberRepository) {}

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
