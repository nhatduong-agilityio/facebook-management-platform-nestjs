import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InternalInvitationController } from './internal-invitation.controller';
import { IInvitationRepository } from '../ports/invitation.repository.port';
import type { Invitation } from '../entities/invitation.entity';

const makeInvitation = (overrides: Partial<Invitation> = {}): Invitation =>
  ({
    id: 'inv-1',
    token: 'a'.repeat(64),
    workspace: { id: 'ws-1' },
    role: 'editor' as const,
    expiresAt: new Date('2026-07-15T00:00:00.000Z'),
    ...overrides,
  }) as unknown as Invitation;

describe('InternalInvitationController', () => {
  let controller: InternalInvitationController;
  let invitations: IInvitationRepository;

  beforeEach(() => {
    invitations = { findById: vi.fn(), findByToken: vi.fn(), findPendingByWorkspaceAndEmail: vi.fn(), save: vi.fn() } as unknown as IInvitationRepository;
    controller = new InternalInvitationController(invitations);
  });

  describe('getEmailContext', () => {
    it('returns email context with token when invitation exists', async () => {
      vi.mocked(invitations.findById).mockResolvedValue(makeInvitation());

      const result = await controller.getEmailContext('inv-1');

      expect(result).toEqual({ token: 'a'.repeat(64) });
    });

    it('throws NotFoundException when invitation does not exist', async () => {
      vi.mocked(invitations.findById).mockResolvedValue(null);

      await expect(controller.getEmailContext('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
