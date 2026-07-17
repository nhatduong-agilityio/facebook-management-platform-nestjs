import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { AppError } from '../../common/errors/app-error';
import type { Workspace } from './entities/workspace.entity';
import type { WorkspaceMember } from './entities/workspace-member.entity';
import type { Invitation } from './entities/invitation.entity';
import type { User } from '../identity/entities/user.entity';

const mockUser: User = { id: 'user-1' } as User;

const makeWorkspace = (overrides: Record<string, unknown> = {}): Workspace =>
  ({
    id: 'ws-1',
    name: 'Acme',
    slug: 'acme',
    description: 'Test workspace',
    status: 'active',
    ownerUserId: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as Workspace;

const makeMember = (overrides: Record<string, unknown> = {}): WorkspaceMember =>
  ({
    id: 'mem-1',
    workspace: { id: 'ws-1' },
    userId: 'user-1',
    role: 'owner',
    joinedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as WorkspaceMember;

const makeInvitation = (overrides: Record<string, unknown> = {}): Invitation =>
  ({
    id: 'inv-1',
    workspace: { id: 'ws-1' },
    email: 'bob@example.com',
    role: 'editor',
    status: 'pending',
    expiresAt: new Date('2026-12-31'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as Invitation;

describe('WorkspaceController', () => {
  let controller: WorkspaceController;
  let service: WorkspaceService;

  beforeEach(() => {
    service = {
      create: vi.fn(),
      listForUser: vi.fn(),
      getById: vi.fn(),
      listMembers: vi.fn(),
      getMember: vi.fn(),
      inviteMember: vi.fn(),
      removeMember: vi.fn(),
      acceptInvitation: vi.fn(),
      changeMemberRole: vi.fn(),
    } as unknown as WorkspaceService;
    controller = new WorkspaceController(service);
  });

  describe('create', () => {
    it('returns a WorkspaceResponseDto on success', async () => {
      vi.mocked(service.create).mockResolvedValue(ok(makeWorkspace()));

      const result = await controller.create({ name: 'Acme' } as never, mockUser);

      expect(service.create).toHaveBeenCalledWith({ name: 'Acme' }, 'user-1');
      expect(result.id).toBe('ws-1');
      expect(result.name).toBe('Acme');
    });

    it('throws on service error', async () => {
      vi.mocked(service.create).mockResolvedValue(err(new AppError('INTERNAL', 'DB error')));

      await expect(controller.create({ name: 'x' } as never, mockUser)).rejects.toMatchObject({
        response: { code: 'INTERNAL' },
      });
    });
  });

  describe('list', () => {
    it('returns a paginated page of workspaces for the user', async () => {
      vi.mocked(service.listForUser).mockResolvedValue(ok({ data: [makeWorkspace()], nextCursor: null }));

      const result = await controller.list(mockUser, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe('acme');
      expect(result.nextCursor).toBeNull();
    });

    it('returns an empty page when the user has no workspaces', async () => {
      vi.mocked(service.listForUser).mockResolvedValue(ok({ data: [], nextCursor: null }));

      const result = await controller.list(mockUser, {});

      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('forwards nextCursor when more pages exist', async () => {
      vi.mocked(service.listForUser).mockResolvedValue(
        ok({ data: [makeWorkspace()], nextCursor: 'cursor-abc' }),
      );

      const result = await controller.list(mockUser, { limit: 1 });

      expect(result.nextCursor).toBe('cursor-abc');
    });
  });

  describe('getById', () => {
    it('returns the workspace', async () => {
      vi.mocked(service.getById).mockResolvedValue(ok(makeWorkspace()));

      const result = await controller.getById('ws-1', mockUser);

      expect(result.id).toBe('ws-1');
    });

    it('throws 404 when not found', async () => {
      vi.mocked(service.getById).mockResolvedValue(err(AppError.notFound('Workspace')));

      await expect(controller.getById('missing', mockUser)).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('listMembers', () => {
    it('returns a paginated page of members', async () => {
      vi.mocked(service.listMembers).mockResolvedValue(ok({ data: [makeMember()], nextCursor: null }));

      const result = await controller.listMembers('ws-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('owner');
      expect(result.nextCursor).toBeNull();
    });

    it('forwards nextCursor when more pages exist', async () => {
      vi.mocked(service.listMembers).mockResolvedValue(
        ok({ data: [makeMember()], nextCursor: 'cursor-xyz' }),
      );

      const result = await controller.listMembers('ws-1', { limit: 1 });

      expect(result.nextCursor).toBe('cursor-xyz');
    });
  });

  describe('getMember', () => {
    it('returns a single member', async () => {
      vi.mocked(service.getMember).mockResolvedValue(ok(makeMember()));

      const result = await controller.getMember('ws-1', 'mem-1');

      expect(result.id).toBe('mem-1');
    });

    it('throws 404 when the member is not found', async () => {
      vi.mocked(service.getMember).mockResolvedValue(err(AppError.notFound('WorkspaceMember')));

      await expect(controller.getMember('ws-1', 'missing')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('inviteMember', () => {
    it('returns an InvitationResponseDto on success', async () => {
      vi.mocked(service.inviteMember).mockResolvedValue(ok(makeInvitation()));

      const result = await controller.inviteMember(
        'ws-1',
        { email: 'bob@example.com', role: 'editor' } as never,
        mockUser,
      );

      expect(result.email).toBe('bob@example.com');
      expect(result.status).toBe('pending');
    });

    it('throws 404 when workspace not found', async () => {
      vi.mocked(service.inviteMember).mockResolvedValue(err(AppError.notFound('Workspace')));

      await expect(
        controller.inviteMember('missing', { email: 'x@x.com', role: 'viewer' } as never, mockUser),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });
  });

  describe('removeMember', () => {
    it('resolves without error on success', async () => {
      vi.mocked(service.removeMember).mockResolvedValue(ok(undefined));

      await expect(controller.removeMember('ws-1', 'mem-1', mockUser)).resolves.toBeUndefined();
    });

    it('throws 403 on sole-owner removal (BR-R02)', async () => {
      vi.mocked(service.removeMember).mockResolvedValue(
        err(AppError.forbidden('Cannot remove the sole owner')),
      );

      await expect(controller.removeMember('ws-1', 'mem-1', mockUser)).rejects.toMatchObject({
        response: { code: 'FORBIDDEN' },
      });
    });
  });

  describe('acceptInvitation', () => {
    it('returns the new WorkspaceMember', async () => {
      vi.mocked(service.acceptInvitation).mockResolvedValue(ok(makeMember({ role: 'editor' })));

      const result = await controller.acceptInvitation('ws-1', 'token-64-hex', mockUser);

      expect(result.workspaceId).toBe('ws-1');
    });

    it('throws 409 when already accepted', async () => {
      vi.mocked(service.acceptInvitation).mockResolvedValue(
        err(AppError.conflict('Invitation already accepted')),
      );

      await expect(
        controller.acceptInvitation('ws-1', 'token', mockUser),
      ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    });

    it('throws 400 when the invitation has expired', async () => {
      vi.mocked(service.acceptInvitation).mockResolvedValue(
        err(new AppError('VALIDATION_ERROR', 'Invitation has expired')),
      );

      await expect(
        controller.acceptInvitation('ws-1', 'token', mockUser),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    });
  });

  describe('changeMemberRole', () => {
    it('returns the updated member', async () => {
      vi.mocked(service.changeMemberRole).mockResolvedValue(ok(makeMember({ role: 'viewer' })));

      const result = await controller.changeMemberRole(
        'ws-1',
        'user-2',
        { role: 'viewer' } as never,
        mockUser,
      );

      expect(result.role).toBe('viewer');
    });

    it('throws 403 when demoting the sole owner', async () => {
      vi.mocked(service.changeMemberRole).mockResolvedValue(
        err(AppError.forbidden('Cannot demote the sole owner')),
      );

      await expect(
        controller.changeMemberRole('ws-1', 'user-1', { role: 'viewer' } as never, mockUser),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    });
  });
});
