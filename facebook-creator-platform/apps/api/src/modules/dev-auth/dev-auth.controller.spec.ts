import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevAuthController } from './dev-auth.controller';
import { DevAuthService } from './dev-auth.service';
import type { DevAuthTokenDto } from './dto/dev-auth-token.dto';

describe('DevAuthController', () => {
  let controller: DevAuthController;
  let service: DevAuthService;

  beforeEach(() => {
    service = { generateToken: vi.fn() } as unknown as DevAuthService;
    controller = new DevAuthController(service);
  });

  describe('generateToken', () => {
    it('delegates to DevAuthService and returns accessToken', async () => {
      const dto: DevAuthTokenDto = { userId: 'clerk-user-1' };
      vi.mocked(service.generateToken).mockResolvedValue({ accessToken: 'jwt-abc' });

      const result = await controller.generateToken(dto);

      expect(service.generateToken).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ accessToken: 'jwt-abc' });
    });

    it('returns loginUrl when the service finds no active session', async () => {
      const dto: DevAuthTokenDto = { email: 'alice@example.com' };
      vi.mocked(service.generateToken).mockResolvedValue({ loginUrl: 'https://clerk.dev/sign-in' });

      const result = await controller.generateToken(dto);

      expect(result).toEqual({ loginUrl: 'https://clerk.dev/sign-in' });
    });
  });
});
