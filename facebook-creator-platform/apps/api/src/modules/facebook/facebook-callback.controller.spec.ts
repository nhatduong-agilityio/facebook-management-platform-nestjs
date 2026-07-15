import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ok, err } from 'neverthrow';
import { FacebookCallbackController } from './facebook-callback.controller';
import { FacebookService } from './facebook.service';
import { AppError } from '../../common/errors/app-error';
import type { ConnectedPageResponseDto } from './dto/connect-page.dto';

const makePages = (): ConnectedPageResponseDto[] => [
  { id: 'fa-1', pageId: 'pg-1', pageName: 'My Page', connectedAt: new Date() },
];

describe('FacebookCallbackController', () => {
  let controller: FacebookCallbackController;
  let service: FacebookService;

  beforeEach(() => {
    service = { handleCallback: vi.fn() } as unknown as FacebookService;
    controller = new FacebookCallbackController(service);
  });

  describe('handleCallback', () => {
    it('returns connected pages on success', async () => {
      vi.mocked(service.handleCallback).mockResolvedValue(ok(makePages()));

      const result = await controller.handleCallback('auth-code', 'state-token');

      expect(service.handleCallback).toHaveBeenCalledWith('auth-code', 'state-token');
      expect(result).toHaveLength(1);
      expect(result[0].pageId).toBe('pg-1');
    });

    it('throws BadRequestException when code is missing', async () => {
      await expect(controller.handleCallback('', 'state-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.handleCallback).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when state is missing', async () => {
      await expect(controller.handleCallback('auth-code', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws 403 when HMAC state mismatch (CROSS_WORKSPACE)', async () => {
      vi.mocked(service.handleCallback).mockResolvedValue(
        err(new AppError('CROSS_WORKSPACE', 'Workspace mismatch')),
      );

      await expect(controller.handleCallback('code', 'tampered-state')).rejects.toMatchObject({
        response: { code: 'CROSS_WORKSPACE' },
      });
    });
  });
});
