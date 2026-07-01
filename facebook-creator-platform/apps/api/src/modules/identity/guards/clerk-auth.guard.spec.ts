import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ok, err } from 'neverthrow';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { IdentityService } from '../identity.service';
import { AppError } from '../../../common/errors/app-error';
import type { User } from '../entities/user.entity';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
  createClerkClient: vi.fn(() => ({ users: { getUser: vi.fn() } })),
}));

import { verifyToken } from '@clerk/backend';

const mockIdentityService = {
  getOrCreateUser: vi.fn(),
} as unknown as IdentityService;

const mockConfig = {
  getOrThrow: vi.fn().mockReturnValue('sk_test_fake'),
} as unknown as ConfigService;

/** Creates a minimal ExecutionContext from an Authorization header value. */
function makeContext(authHeader?: string): ExecutionContext {
  const request = { headers: { authorization: authHeader }, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new ClerkAuthGuard(mockIdentityService, mockConfig);
  });

  it('throws 401 when Authorization header is missing', async () => {
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 when token is not a Bearer token', async () => {
    await expect(guard.canActivate(makeContext('Basic abc123'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 when verifyToken rejects', async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error('bad token'));

    await expect(guard.canActivate(makeContext('Bearer invalid.jwt'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 when getOrCreateUser returns err(FORBIDDEN)', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'user_abc' } as never);
    vi.mocked(mockIdentityService.getOrCreateUser).mockResolvedValue(
      err(new AppError('FORBIDDEN', 'Account is inactive')),
    );

    await expect(guard.canActivate(makeContext('Bearer valid.jwt'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns true and attaches user to request on valid token', async () => {
    const user = { id: 'user-1', status: 'active' } as User;
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'user_clerk' } as never);
    vi.mocked(mockIdentityService.getOrCreateUser).mockResolvedValue(ok(user));

    const ctx = makeContext('Bearer valid.jwt');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const request = ctx.switchToHttp().getRequest<{ user: User }>();
    expect(request.user).toBe(user);
  });
});
