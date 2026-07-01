import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityService } from './identity.service';
import type { IUserRepository } from './ports/user.repository.port';
import type { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import type { IIdentityProvider } from './ports/identity-provider.port';
import type { User } from './entities/user.entity';

const mockUserRepo = {
  findByClerkId: vi.fn(),
  save: vi.fn(),
} as unknown as IUserRepository;

const mockWorkspaceMemberRepo = {
  findRole: vi.fn(),
} as unknown as IWorkspaceMemberRepository;

const mockIdentityProvider = {
  getProfile: vi.fn(),
} as unknown as IIdentityProvider;

describe('IdentityService', () => {
  let service: IdentityService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IdentityService(mockUserRepo, mockWorkspaceMemberRepo, mockIdentityProvider);
  });

  describe('getOrCreateUser', () => {
    it('returns ok(user) for an existing active user without calling the identity provider', async () => {
      const existing = { clerkUserId: 'user_abc', status: 'active' } as User;
      vi.mocked(mockUserRepo.findByClerkId).mockResolvedValue(existing);

      const result = await service.getOrCreateUser('user_abc');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(existing);
      expect(mockIdentityProvider.getProfile).not.toHaveBeenCalled();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('creates a new user on first sign-in and returns ok', async () => {
      vi.mocked(mockUserRepo.findByClerkId).mockResolvedValue(null);
      vi.mocked(mockIdentityProvider.getProfile).mockResolvedValue({
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatarUrl: 'https://img.clerk.com/avatar.jpg',
      });
      vi.mocked(mockUserRepo.save).mockResolvedValue(undefined);

      const result = await service.getOrCreateUser('user_new');

      expect(mockIdentityProvider.getProfile).toHaveBeenCalledWith('user_new');
      expect(mockUserRepo.save).toHaveBeenCalledOnce();
      expect(result.isOk()).toBe(true);
      const user = result._unsafeUnwrap();
      expect(user.clerkUserId).toBe('user_new');
      expect(user.email).toBe('new@example.com');
      expect(user.fullName).toBe('Jane Doe');
    });

    it('concatenates firstName and lastName when only one is present', async () => {
      vi.mocked(mockUserRepo.findByClerkId).mockResolvedValue(null);
      vi.mocked(mockIdentityProvider.getProfile).mockResolvedValue({
        email: 'a@b.com',
        firstName: 'Alice',
      });
      vi.mocked(mockUserRepo.save).mockResolvedValue(undefined);

      const result = await service.getOrCreateUser('user_alice');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().fullName).toBe('Alice');
    });

    it('omits fullName when the provider returns neither firstName nor lastName', async () => {
      vi.mocked(mockUserRepo.findByClerkId).mockResolvedValue(null);
      vi.mocked(mockIdentityProvider.getProfile).mockResolvedValue({
        email: 'anon@b.com',
      });
      vi.mocked(mockUserRepo.save).mockResolvedValue(undefined);

      const result = await service.getOrCreateUser('user_anon');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().fullName).toBeUndefined();
    });

    it('returns err(FORBIDDEN) when the account is inactive', async () => {
      const inactive = { clerkUserId: 'user_off', status: 'inactive' } as User;
      vi.mocked(mockUserRepo.findByClerkId).mockResolvedValue(inactive);

      const result = await service.getOrCreateUser('user_off');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
    });
  });

  describe('getUserWorkspaceRole', () => {
    it('returns ok(null) when the user has no membership', async () => {
      vi.mocked(mockWorkspaceMemberRepo.findRole).mockResolvedValue(null);

      const result = await service.getUserWorkspaceRole('user-id', 'ws-id');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns ok(role) when a membership row exists', async () => {
      vi.mocked(mockWorkspaceMemberRepo.findRole).mockResolvedValue('editor');

      const result = await service.getUserWorkspaceRole('user-id', 'ws-id');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('editor');
    });
  });
});
