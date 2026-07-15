import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityController } from './identity.controller';
import type { User } from './entities/user.entity';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'alice@example.com',
    fullName: 'Alice Smith',
    avatarUrl: 'https://example.com/avatar.png',
    status: 'active',
    ...overrides,
  }) as User;

describe('IdentityController', () => {
  let controller: IdentityController;

  beforeEach(() => {
    controller = new IdentityController();
  });

  describe('getMe', () => {
    it('maps the injected user entity to an AuthMeResponseDto', () => {
      const user = makeUser();

      const result = controller.getMe(user);

      expect(result).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        fullName: 'Alice Smith',
        avatarUrl: 'https://example.com/avatar.png',
        status: 'active',
      });
    });

    it('propagates a null avatarUrl when the user has no avatar', () => {
      const user = makeUser({ avatarUrl: null as unknown as string });

      const result = controller.getMe(user);

      expect(result.avatarUrl).toBeNull();
    });
  });
});
