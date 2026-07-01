import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService } from './workspace.service';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberWriteRepository } from './ports/workspace-member.repository.port';
import { Workspace } from './entities/workspace.entity';

const mockWorkspaceRepo = {
  findById: vi.fn(),
  findAllByUserId: vi.fn(),
  existsBySlug: vi.fn(),
  save: vi.fn(),
} as unknown as IWorkspaceRepository;

const mockMemberRepo = {
  persist: vi.fn(),
} as unknown as IWorkspaceMemberWriteRepository;

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    service = new WorkspaceService(mockWorkspaceRepo, mockMemberRepo);
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

    it('stages the owner WorkspaceMember before saving the workspace', async () => {
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

    it('generates slug by lowercasing and replacing non-alphanumeric chars', async () => {
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

    it('returns ok(workspaces) when workspaces exist', async () => {
      const ws = Object.assign(new Workspace(), { id: 'ws-1', name: 'My WS' });
      vi.mocked(mockWorkspaceRepo.findAllByUserId).mockResolvedValue([ws]);

      const result = await service.listForUser('user-1');

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
});
