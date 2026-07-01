import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ok, err } from 'neverthrow';
import { WorkspaceRolesGuard } from './roles.guard';
import { IdentityService } from '../identity.service';
import { AppError } from '../../../common/errors/app-error';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { User } from '../entities/user.entity';
import type { WorkspaceRole } from '../types/workspace-role.type';

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({ users: { getUser: vi.fn() } })),
}));

const mockReflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
const mockIdentityService = {
  getUserWorkspaceRole: vi.fn(),
} as unknown as IdentityService;

/** Builds a minimal ExecutionContext with optional user and workspaceId. */
function makeContext(opts: { user?: User; workspaceId?: string } = {}): ExecutionContext {
  const request = {
    user: opts.user,
    params: opts.workspaceId ? { workspaceId: opts.workspaceId } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('WorkspaceRolesGuard', () => {
  let guard: WorkspaceRolesGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new WorkspaceRolesGuard(mockReflector, mockIdentityService);
  });

  it('passes when no @Roles metadata is present', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(undefined);

    const result = await guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(mockIdentityService.getUserWorkspaceRole).not.toHaveBeenCalled();
  });

  it('denies when there is no authenticated user', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['owner'] as WorkspaceRole[]);

    const result = await guard.canActivate(makeContext({ workspaceId: 'ws-1' }));

    expect(result).toBe(false);
  });

  it('denies when workspaceId param is missing', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['editor'] as WorkspaceRole[]);
    const user = { id: 'u-1' } as User;

    const result = await guard.canActivate(makeContext({ user }));

    expect(result).toBe(false);
  });

  it('denies when user is not a member (role = null)', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['viewer'] as WorkspaceRole[]);
    vi.mocked(mockIdentityService.getUserWorkspaceRole).mockResolvedValue(ok(null));
    const user = { id: 'u-1' } as User;

    const result = await guard.canActivate(makeContext({ user, workspaceId: 'ws-1' }));

    expect(result).toBe(false);
  });

  it('passes when user has the exact required role', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['editor'] as WorkspaceRole[]);
    vi.mocked(mockIdentityService.getUserWorkspaceRole).mockResolvedValue(ok('editor'));
    const user = { id: 'u-1' } as User;

    const result = await guard.canActivate(makeContext({ user, workspaceId: 'ws-1' }));

    expect(result).toBe(true);
  });

  it('passes when user has a higher role than required', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['editor'] as WorkspaceRole[]);
    vi.mocked(mockIdentityService.getUserWorkspaceRole).mockResolvedValue(ok('owner'));
    const user = { id: 'u-1' } as User;

    const result = await guard.canActivate(makeContext({ user, workspaceId: 'ws-1' }));

    expect(result).toBe(true);
  });

  it('denies when user role is below the required level', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['owner'] as WorkspaceRole[]);
    vi.mocked(mockIdentityService.getUserWorkspaceRole).mockResolvedValue(ok('editor'));
    const user = { id: 'u-1' } as User;

    const result = await guard.canActivate(makeContext({ user, workspaceId: 'ws-1' }));

    expect(result).toBe(false);
  });

  it('denies when role lookup returns an error', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(['viewer'] as WorkspaceRole[]);
    vi.mocked(mockIdentityService.getUserWorkspaceRole).mockResolvedValue(
      err(new AppError('INTERNAL', 'DB error')),
    );
    const user = { id: 'u-1' } as User;

    const result = await guard.canActivate(makeContext({ user, workspaceId: 'ws-1' }));

    expect(result).toBe(false);
  });

  it('reads required roles via the correct metadata key', async () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(undefined);
    const ctx = makeContext();

    await guard.canActivate(ctx);

    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });
});
