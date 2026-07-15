import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationController } from './notification.controller';
import { INotificationClient } from './ports/notification.client.port';
import { DownstreamServiceError } from '../../common/http/http-client.port';
import type { NotificationResponseDto } from './dto/notification.dto';

const makeNotification = (overrides: Partial<NotificationResponseDto> = {}): NotificationResponseDto => ({
  id: 'n-1',
  workspaceId: 'ws-1',
  type: 'post_published',
  title: 'Post published',
  message: 'Your post was published.',
  readStatus: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('NotificationController', () => {
  let controller: NotificationController;
  let client: INotificationClient;
  const user = { id: 'user-1' };

  beforeEach(() => {
    client = {
      getNotifications: vi.fn(),
      markAsRead: vi.fn(),
    } as unknown as INotificationClient;
    controller = new NotificationController(client);
  });

  describe('getNotifications', () => {
    it('returns notifications from the client', async () => {
      vi.mocked(client.getNotifications).mockResolvedValue([makeNotification()]);

      const result = await controller.getNotifications('ws-1', user);

      expect(client.getNotifications).toHaveBeenCalledWith('ws-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('post_published');
      expect(result[0].readStatus).toBe(false);
    });

    it('throws 503 when notification service is unreachable', async () => {
      vi.mocked(client.getNotifications).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3005'),
      );

      await expect(controller.getNotifications('ws-1', user)).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });

    it('throws 500 for unexpected non-5xx downstream status', async () => {
      vi.mocked(client.getNotifications).mockRejectedValue(
        new DownstreamServiceError(404, 'http://localhost:3005'),
      );

      await expect(controller.getNotifications('ws-1', user)).rejects.toMatchObject({
        response: { code: 'INTERNAL' },
      });
    });
  });

  describe('markAsRead', () => {
    it('calls the client to mark as read', async () => {
      vi.mocked(client.markAsRead).mockResolvedValue(undefined);

      await controller.markAsRead('n-1', user);

      expect(client.markAsRead).toHaveBeenCalledWith('n-1', 'user-1');
    });

    it('throws 503 when notification service is unreachable', async () => {
      vi.mocked(client.markAsRead).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3005'),
      );

      await expect(controller.markAsRead('n-1', user)).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });
  });
});
