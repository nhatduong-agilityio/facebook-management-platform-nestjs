import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../../../common/guards/internal-secret.guard';
import { IInvitationRepository } from '../ports/invitation.repository.port';

/**
 * Shape returned by `GET /internal/invitations/:id`.
 *
 * Intentionally minimal — only `token` is absent from the event payload
 * and therefore fetched here. All other invitation fields are already
 * carried by `MemberInvitedEvent` (ADR-050 / ADR-072).
 */
export interface InvitationEmailContext {
  token: string;
}

/**
 * Internal HTTP endpoint exposing invitation token context (ADR-050).
 *
 * **Not** Swagger-documented. **Not** Clerk-authenticated.
 * Protected only by `InternalSecretGuard` (`x-internal-secret` header).
 *
 * The Email Service calls this after receiving `workspace.member-invited`
 * to obtain the magic-link token without it ever traversing the event bus.
 */
@Controller('internal/invitations')
@UseGuards(InternalSecretGuard)
export class InternalInvitationController {
  /**
   * @param invitations - Repository for invitation lookups.
   */
  constructor(private readonly invitations: IInvitationRepository) {}

  /**
   * Returns the email context for a pending invitation.
   *
   * Used exclusively by `services/email` to construct the magic-link
   * `acceptUrl` for the member-invitation email template.
   *
   * @param id - UUID v7 of the invitation record.
   * @returns `InvitationEmailContext` — 404 when the invitation does not exist.
   */
  @Get(':id')
  async getEmailContext(@Param('id') id: string): Promise<InvitationEmailContext> {
    const invitation = await this.invitations.findById(id);
    if (!invitation) throw new NotFoundException(`Invitation ${id} not found`);

    return { token: invitation.token };
  }
}
