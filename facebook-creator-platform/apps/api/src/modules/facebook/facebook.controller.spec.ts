import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { AppError } from '../../common/errors/app-error';
import type { ConnectUrlResponseDto } from './dto/connect-url-response.dto';
import type { ConnectedPageResponseDto } from './dto/connect-page.dto';

const makeConnectUrl = (): ConnectUrlResponseDto => ({
  url: 'https://facebook.com/dialog/oauth',
  state: 'state-token',
});

const makePages = (): ConnectedPageResponseDto[] => [
  { id: 'fa-1', pageId: 'pg-1', pageName: 'My Page', connectedAt: new Date() },
];

describe('FacebookController', () => {
  let controller: FacebookController;
  let service: FacebookService;

  beforeEach(() => {
    service = {
      getConnectUrl: vi.fn(),
      connectPage: vi.fn(),
      refreshAccountToken: vi.fn(),
    } as unknown as FacebookService;
    controller = new FacebookController(service);
  });

  describe('getConnectUrl', () => {
    it('returns the OAuth connect URL', () => {
      vi.mocked(service.getConnectUrl).mockReturnValue(ok(makeConnectUrl()));

      const result = controller.getConnectUrl('ws-1');

      expect(service.getConnectUrl).toHaveBeenCalledWith('ws-1');
      expect(result.url).toContain('facebook.com');
    });

    it('throws 403 on FORBIDDEN error', () => {
      vi.mocked(service.getConnectUrl).mockReturnValue(err(AppError.forbidden()));

      expect(() => controller.getConnectUrl('ws-1')).toThrow();
    });
  });

  describe('connectPage', () => {
    it('returns connected pages on success', async () => {
      vi.mocked(service.connectPage).mockResolvedValue(ok(makePages()));

      const result = await controller.connectPage('ws-1', { code: 'auth-code', state: 'state' });

      expect(result).toHaveLength(1);
      expect(result[0].pageId).toBe('pg-1');
    });

    it('throws 403 on CROSS_WORKSPACE error', async () => {
      vi.mocked(service.connectPage).mockResolvedValue(
        err(new AppError('CROSS_WORKSPACE', 'Workspace mismatch')),
      );

      await expect(
        controller.connectPage('ws-1', { code: 'code', state: 'tampered' }),
      ).rejects.toMatchObject({ response: { code: 'CROSS_WORKSPACE' } });
    });

    it('throws 404 on NOT_FOUND error', async () => {
      vi.mocked(service.connectPage).mockResolvedValue(err(AppError.notFound('Pages')));

      await expect(
        controller.connectPage('ws-1', { code: 'code', state: 'state' }),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });
  });

  describe('refreshToken', () => {
    it('resolves without error on success', async () => {
      vi.mocked(service.refreshAccountToken).mockResolvedValue(ok(undefined));

      await expect(controller.refreshToken('ws-1', 'fa-1')).resolves.toBeUndefined();
      expect(service.refreshAccountToken).toHaveBeenCalledWith('ws-1', 'fa-1');
    });

    it('throws 404 when account not found', async () => {
      vi.mocked(service.refreshAccountToken).mockResolvedValue(
        err(AppError.notFound('FacebookAccount')),
      );

      await expect(controller.refreshToken('ws-1', 'missing')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });
});
