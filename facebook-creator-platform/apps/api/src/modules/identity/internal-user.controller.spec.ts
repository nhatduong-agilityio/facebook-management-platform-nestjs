import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InternalUserController } from './internal-user.controller';
import { IUserRepository } from './ports/user.repository.port';

const makeUser = (overrides = {}) =>
  ({ id: 'user-1', email: 'alice@example.com', clerkUserId: 'clerk_1', ...overrides } as any);

describe('InternalUserController', () => {
  let controller: InternalUserController;
  let users: IUserRepository;

  beforeEach(() => {
    users = { findById: vi.fn(), findByClerkId: vi.fn(), save: vi.fn() } as unknown as IUserRepository;
    controller = new InternalUserController(users);
  });

  it('returns { id, email } when the user exists', async () => {
    vi.mocked(users.findById).mockResolvedValue(makeUser());

    const result = await controller.getUser('user-1');

    expect(users.findById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'user-1', email: 'alice@example.com' });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    vi.mocked(users.findById).mockResolvedValue(null);

    await expect(controller.getUser('missing')).rejects.toThrow(NotFoundException);
  });
});
