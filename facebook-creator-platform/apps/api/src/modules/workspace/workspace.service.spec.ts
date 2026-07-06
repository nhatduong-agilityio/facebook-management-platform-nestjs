import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService } from './workspace.service';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import { IInvitationRepository } from './ports/invitation.repository.port';
import { IEventBus } from '../../common/events/event-bus.port';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Invitation } from './entities/invitation.entity';
import { MemberJoinedEvent } from './events/member-joined.event';
import { MemberRoleChangedEvent } from './events/member-role-changed.event';

const mockWorkspaceRepo = {
  findById: vi.fn(),
  findAllByUserId: vi.fn(),
  existsBySlug: vi.fn(),
  save: vi.fn(),
} as unknown as IWorkspaceRepository;

const mockMemberRepo = {
  persist: vi.fn(),
  findByWorkspaceAndId: vi.fn(),
  findByWorkspaceAndUserId: vi.fn(),
  findAllByWorkspaceId: vi.fn(),
  countOwners: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
} as unknown as IWorkspaceMemberRepository;

const mockInvitationRepo = {
  save: vi.fn(),
  findPendingByWorkspaceAndEmail: vi.fn(),
  findByToken: vi.fn(),
} as unknown as IInvitationRepository;

const mockEventBus = {
  publish: vi.fn(),
} as unknown as IEventBus;

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    service = new WorkspaceService(mockWorkspaceRepo, mockMemberRepo, mockInvitationRepo, mockEventBus);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('returns ok(workspace) on the happy path', async () => {
      vi.mocked(mockWorkspaceRepo.existsBySlug).mockResolvedValue(false);
      vi.mocked(mockWorkspaceRepo.save).mockResolvedValue(undefined);

      const result = await service.create({ name: 'My Brand' }, 'user-1');

      expect(result.isOk()).toBe(true);
      const ws = result._unsafeUnwrap();
      expect(ws.name).toBe('My Brand');
      expect(ws.slug).toBe('my-brand');
      expect(ws.ownerUserId).toBe('user-1');
    });

    it('stages the owner WorkspaceMember with role=owner before saving', async () => {
      vi.mocked(mockWorkspaceRepo.existsBySlug).mockResolvedValue(false);
      vi.mocked(mockWorkspaceRepo.save).mockResolvedValue(undefined);

      await service.create({ name: 'Test WS' }, 'user-2');

      expect(mockMemberRepo.persist).toHaveBeenCalledOnce();
      const member = vi.mocked(mockMemberRepo.persist).mock.calls[0][0];
      expect(member.role).toBe('owner');
      expect(member.userId).toBe('user-2');
    });

    it('returns err(CONFLICT) when the derived slug is already taken', async () => {
      vi.mocked(mockWorkspaceRepo.existsBySlug).mockResolvedValue(true);

      const result = await service.create({ name: 'Taken Name' }, 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });

    it('derives slug by lowercasing and replacing non-alphanumeric chars', async () => {
      vi.mocked(mockWorkspaceRepo.existsBySlug).mockResolvedValue(false);
      vi.mocked(mockWorkspaceRepo.save).mockResolvedValue(undefined);

      const result = await service.create({ name: 'Hello World!!' }, 'u-1');

      expect(result._unsafeUnwrap().slug).toBe('hello-world');
    });

    it('saves description when provided', async () => {
      vi.mocked(mockWorkspaceRepo.existsBySlug).mockResolvedValue(false);
      vi.mocked(mockWorkspaceRepo.save).mockResolvedValue(undefined);

      const result = await service.create({ name: 'WS', description: 'A desc' }, 'u-1');

      expect(result._unsafeUnwrap().description).toBe('A desc');
    });
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  describe('listForUser', () => {
    it('returns ok([]) when the user has no workspaces', async () => {
      vi.mocked(mockWorkspaceRepo.findAllByUserId).mockResolvedValue([]);

      const result = await service.listForUser('user-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('returns ok(workspaces) when memberships exist', async () => {
      const ws = Object.assign(new Workspace(), { id: 'ws-1', name: 'My WS' });
      vi.mocked(mockWorkspaceRepo.findAllByUserId).mockResolvedValue([ws]);

      const result = await service.listForUser('user-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // listMembers
  // ---------------------------------------------------------------------------

  describe('listMembers', () => {
    it('returns ok([]) when workspace has no members', async () => {
      vi.mocked(mockMemberRepo.findAllByWorkspaceId).mockResolvedValue([]);

      const result = await service.listMembers('ws-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('returns ok(members) when members exist', async () => {
      const m = Object.assign(new WorkspaceMember(), { id: 'm-1', userId: 'u-1', role: 'owner' });
      vi.mocked(mockMemberRepo.findAllByWorkspaceId).mockResolvedValue([m]);

      const result = await service.listMembers('ws-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  describe('getById', () => {
    it('returns ok(workspace) when workspace exists and user is a member', async () => {
      const ws = Object.assign(new Workspace(), { id: 'ws-1', name: 'My WS' });
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockWorkspaceRepo.findAllByUserId).mockResolvedValue([ws]);

      const result = await service.getById('ws-1', 'user-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().id).toBe('ws-1');
    });

    it('returns err(NOT_FOUND) when workspace does not exist', async () => {
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(null);

      const result = await service.getById('missing', 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(NOT_FOUND) when workspace exists but user is not a member', async () => {
      const ws = Object.assign(new Workspace(), { id: 'ws-1', name: 'My WS' });
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockWorkspaceRepo.findAllByUserId).mockResolvedValue([]);

      const result = await service.getById('ws-1', 'user-99');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // inviteMember
  // ---------------------------------------------------------------------------

  describe('inviteMember', () => {
    const ws = Object.assign(new Workspace(), { id: 'ws-1', name: 'My WS' });

    it('returns ok(invitation) on the happy path', async () => {
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockInvitationRepo.findPendingByWorkspaceAndEmail).mockResolvedValue(null);
      vi.mocked(mockInvitationRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.inviteMember('ws-1', { email: 'a@b.com', role: 'editor' }, 'user-1');

      expect(result.isOk()).toBe(true);
      const inv = result._unsafeUnwrap();
      expect(inv.email).toBe('a@b.com');
      expect(inv.role).toBe('editor');
      expect(inv.status).toBe('pending');
      expect(inv.token).toHaveLength(64);
    });

    it('publishes MemberInvitedEvent after saving', async () => {
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockInvitationRepo.findPendingByWorkspaceAndEmail).mockResolvedValue(null);
      vi.mocked(mockInvitationRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      await service.inviteMember('ws-1', { email: 'a@b.com', role: 'viewer' }, 'user-1');

      expect(mockEventBus.publish).toHaveBeenCalledOnce();
    });

    it('returns err(NOT_FOUND) when workspace does not exist', async () => {
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(null);

      const result = await service.inviteMember('bad-ws', { email: 'a@b.com', role: 'editor' }, 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(CONFLICT) when a pending invite for the same email exists', async () => {
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockInvitationRepo.findPendingByWorkspaceAndEmail).mockResolvedValue(
        Object.assign(new Invitation(), { id: 'inv-1', status: 'pending' }),
      );

      const result = await service.inviteMember('ws-1', { email: 'dup@b.com', role: 'editor' }, 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });
  });

  // ---------------------------------------------------------------------------
  // removeMember
  // ---------------------------------------------------------------------------

  describe('removeMember', () => {
    it('returns ok(void) when a non-owner member is removed', async () => {
      const member = Object.assign(new WorkspaceMember(), { id: 'm-1', userId: 'u-2', role: 'editor' });
      vi.mocked(mockMemberRepo.findByWorkspaceAndId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.remove).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.removeMember('ws-1', 'm-1', 'owner-1');

      expect(result.isOk()).toBe(true);
      expect(mockMemberRepo.remove).toHaveBeenCalledWith(member);
    });

    it('publishes MemberRemovedEvent after removal', async () => {
      const member = Object.assign(new WorkspaceMember(), { id: 'm-1', userId: 'u-2', role: 'editor' });
      vi.mocked(mockMemberRepo.findByWorkspaceAndId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.remove).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      await service.removeMember('ws-1', 'm-1', 'owner-1');

      expect(mockEventBus.publish).toHaveBeenCalledOnce();
    });

    it('returns err(NOT_FOUND) when member does not exist in the workspace', async () => {
      vi.mocked(mockMemberRepo.findByWorkspaceAndId).mockResolvedValue(null);

      const result = await service.removeMember('ws-1', 'bad-id', 'owner-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(FORBIDDEN) when removing the sole owner (BR-R02)', async () => {
      const member = Object.assign(new WorkspaceMember(), { id: 'm-1', userId: 'owner-1', role: 'owner' });
      vi.mocked(mockMemberRepo.findByWorkspaceAndId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.countOwners).mockResolvedValue(1);

      const result = await service.removeMember('ws-1', 'm-1', 'owner-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
    });

    it('allows removing an owner when another owner exists', async () => {
      const member = Object.assign(new WorkspaceMember(), { id: 'm-1', userId: 'owner-2', role: 'owner' });
      vi.mocked(mockMemberRepo.findByWorkspaceAndId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.countOwners).mockResolvedValue(2);
      vi.mocked(mockMemberRepo.remove).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.removeMember('ws-1', 'm-1', 'owner-1');

      expect(result.isOk()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // acceptInvitation (T2.8)
  // ---------------------------------------------------------------------------

  describe('acceptInvitation', () => {
    const ws = Object.assign(new Workspace(), { id: 'ws-1', name: 'WS' });

    function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
      const inv = new Invitation();
      // workspace.id is accessed on the Ref<Workspace>; simulate with a plain proxy
      (inv as unknown as Record<string, unknown>)['workspace'] = { id: 'ws-1' };
      inv.status = 'pending';
      inv.role = 'editor';
      inv.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      inv.id = 'inv-1';
      return Object.assign(inv, overrides);
    }

    it('creates a WorkspaceMember and emits MemberJoinedEvent on success', async () => {
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(makeInvitation());
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockMemberRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.acceptInvitation('ws-1', 'valid-token', 'user-42');

      expect(result.isOk()).toBe(true);
      const member = result._unsafeUnwrap();
      expect(member.role).toBe('editor');
      expect(member.userId).toBe('user-42');
      expect(mockMemberRepo.save).toHaveBeenCalledOnce();

      const publishedEvent = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MemberJoinedEvent);
      expect((publishedEvent as MemberJoinedEvent).userId).toBe('user-42');
      expect((publishedEvent as MemberJoinedEvent).workspaceId).toBe('ws-1');
    });

    it('marks the invitation status as accepted before flushing', async () => {
      const inv = makeInvitation();
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(inv);
      vi.mocked(mockWorkspaceRepo.findById).mockResolvedValue(ws);
      vi.mocked(mockMemberRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      await service.acceptInvitation('ws-1', 'valid-token', 'user-42');

      expect(inv.status).toBe('accepted');
    });

    it('returns err(NOT_FOUND) when token does not exist', async () => {
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(null);

      const result = await service.acceptInvitation('ws-1', 'bad-token', 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(NOT_FOUND) when token belongs to a different workspace', async () => {
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(makeInvitation());
      // workspaceId in URL does not match invitation.workspace.id ('ws-1')

      const result = await service.acceptInvitation('ws-OTHER', 'valid-token', 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(CONFLICT) when invitation is already accepted', async () => {
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(
        makeInvitation({ status: 'accepted' }),
      );

      const result = await service.acceptInvitation('ws-1', 'used-token', 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });

    it('returns err(VALIDATION_ERROR) when invitation is expired', async () => {
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(
        makeInvitation({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const result = await service.acceptInvitation('ws-1', 'expired-token', 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
    });

    it('returns err(VALIDATION_ERROR) when invitation is revoked', async () => {
      vi.mocked(mockInvitationRepo.findByToken).mockResolvedValue(
        makeInvitation({ status: 'revoked' }),
      );

      const result = await service.acceptInvitation('ws-1', 'revoked-token', 'user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // changeMemberRole (T2.8)
  // ---------------------------------------------------------------------------

  describe('changeMemberRole', () => {
    it('returns ok(member) with updated role and emits MemberRoleChangedEvent', async () => {
      const member = Object.assign(new WorkspaceMember(), {
        id: 'm-1', userId: 'user-2', role: 'viewer',
      });
      vi.mocked(mockMemberRepo.findByWorkspaceAndUserId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.changeMemberRole('ws-1', 'user-2', 'editor', 'owner-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().role).toBe('editor');

      const event = vi.mocked(mockEventBus.publish).mock.calls[0][0] as MemberRoleChangedEvent;
      expect(event).toBeInstanceOf(MemberRoleChangedEvent);
      expect(event.oldRole).toBe('viewer');
      expect(event.newRole).toBe('editor');
      expect(event.userId).toBe('user-2');
      expect(event.changedByUserId).toBe('owner-1');
    });

    it('returns err(NOT_FOUND) when member does not exist', async () => {
      vi.mocked(mockMemberRepo.findByWorkspaceAndUserId).mockResolvedValue(null);

      const result = await service.changeMemberRole('ws-1', 'ghost', 'editor', 'owner-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('returns err(FORBIDDEN) when demoting the sole owner (BR-R02)', async () => {
      const member = Object.assign(new WorkspaceMember(), {
        id: 'm-1', userId: 'owner-1', role: 'owner',
      });
      vi.mocked(mockMemberRepo.findByWorkspaceAndUserId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.countOwners).mockResolvedValue(1);

      const result = await service.changeMemberRole('ws-1', 'owner-1', 'editor', 'owner-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
    });

    it('allows demoting an owner when another owner exists', async () => {
      const member = Object.assign(new WorkspaceMember(), {
        id: 'm-1', userId: 'owner-2', role: 'owner',
      });
      vi.mocked(mockMemberRepo.findByWorkspaceAndUserId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.countOwners).mockResolvedValue(2);
      vi.mocked(mockMemberRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.changeMemberRole('ws-1', 'owner-2', 'editor', 'owner-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().role).toBe('editor');
    });

    it('allows promoting a viewer to owner without any guard check', async () => {
      const member = Object.assign(new WorkspaceMember(), {
        id: 'm-1', userId: 'user-3', role: 'viewer',
      });
      vi.mocked(mockMemberRepo.findByWorkspaceAndUserId).mockResolvedValue(member);
      vi.mocked(mockMemberRepo.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publish).mockResolvedValue(undefined);

      const result = await service.changeMemberRole('ws-1', 'user-3', 'owner', 'owner-1');

      expect(result.isOk()).toBe(true);
      expect(mockMemberRepo.countOwners).not.toHaveBeenCalled();
    });
  });
});
