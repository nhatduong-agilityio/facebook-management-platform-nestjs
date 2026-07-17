import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InternalWorkspaceController } from './internal-workspace.controller';
import { IWorkspaceMemberRepository } from '../ports/workspace-member.repository.port';
import { IWorkspaceRepository } from '../ports/workspace.repository.port';

const makeWorkspace = (overrides = {}) =>
  ({ id: 'ws-1', ownerUserId: 'user-1', ...overrides } as any);

const makeEm = (user: any) => ({
  findOne: vi.fn().mockResolvedValue(user),
});

describe('InternalWorkspaceController', () => {
  let controller: InternalWorkspaceController;
  let workspaces: IWorkspaceRepository;
  let members: IWorkspaceMemberRepository;

  beforeEach(() => {
    workspaces = { findById: vi.fn(), findAllByUserId: vi.fn(), existsBySlug: vi.fn(), save: vi.fn() } as unknown as IWorkspaceRepository;
    members = { findAllByWorkspaceId: vi.fn() } as unknown as IWorkspaceMemberRepository;
  });

  describe('getWorkspace', () => {
    it('returns { id, ownerId, ownerEmail } when workspace and owner exist', async () => {
      const owner = { id: 'user-1', email: 'owner@example.com' };
      const em = makeEm(owner) as any;
      controller = new InternalWorkspaceController(members, workspaces, em);
      vi.mocked(workspaces.findById).mockResolvedValue(makeWorkspace());

      const result = await controller.getWorkspace('ws-1');

      expect(result).toEqual({ id: 'ws-1', ownerId: 'user-1', ownerEmail: 'owner@example.com' });
    });

    it('throws NotFoundException when workspace does not exist', async () => {
      const em = makeEm(null) as any;
      controller = new InternalWorkspaceController(members, workspaces, em);
      vi.mocked(workspaces.findById).mockResolvedValue(null);

      await expect(controller.getWorkspace('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMembers', () => {
    it('returns mapped member list', async () => {
      const em = makeEm(null) as any;
      controller = new InternalWorkspaceController(members, workspaces, em);
      vi.mocked(members.findAllByWorkspaceId).mockResolvedValue({
        data: [
          { userId: 'u-1', role: 'owner' } as any,
          { userId: 'u-2', role: 'editor' } as any,
        ],
        nextCursor: null,
      });

      const result = await controller.getMembers('ws-1');

      expect(result).toEqual([
        { userId: 'u-1', role: 'owner' },
        { userId: 'u-2', role: 'editor' },
      ]);
    });
  });
});
