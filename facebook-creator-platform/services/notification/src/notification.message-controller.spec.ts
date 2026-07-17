import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { NotificationMessageController } from './notification.message-controller';
import { NotificationService } from './notification.service';
import type { NotificationResponseDto } from './dto/notification.dto';

const mockService = {
  getNotificationsForUser: vi.fn(),
  markAsRead: vi.fn(),
} as unknown as NotificationService;

const makeNotificationDto = (): NotificationResponseDto => ({
  id: 'notif-1',
  workspaceId: 'ws-1',
  type: 'posts.published',
  title: 'Post published',
  message: 'Your post was published.',
  readStatus: false,
  readAt: null,
  createdAt: '2026-07-17T00:00:00.000Z',
});

describe('NotificationMessageController', () => {
  let controller: NotificationMessageController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new NotificationMessageController(mockService);
  });

  // ---------------------------------------------------------------------------
  // notification.list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('returns NotificationResponseDto[] from NotificationService', async () => {
      const rows = [makeNotificationDto()];
      vi.mocked(mockService.getNotificationsForUser).mockResolvedValue(rows);

      const result = await controller.list({ workspaceId: 'ws-1', userId: 'user-1' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('notif-1');
      expect(mockService.getNotificationsForUser).toHaveBeenCalledWith('ws-1', 'user-1');
    });

    it('throws RpcException on service failure', async () => {
      vi.mocked(mockService.getNotificationsForUser).mockRejectedValue(new Error('DB error'));

      await expect(
        controller.list({ workspaceId: 'ws-1', userId: 'user-1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });

  // ---------------------------------------------------------------------------
  // notification.mark-read
  // ---------------------------------------------------------------------------

  describe('markRead', () => {
    it('returns { updated: true } when notification is newly marked as read', async () => {
      vi.mocked(mockService.markAsRead).mockResolvedValue(true);

      const result = await controller.markRead({ notificationId: 'notif-1', userId: 'user-1' });

      expect(result).toEqual({ updated: true });
      expect(mockService.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('returns { updated: false } when notification is already read (BR-F08 silent no-op)', async () => {
      vi.mocked(mockService.markAsRead).mockResolvedValue(false);

      const result = await controller.markRead({ notificationId: 'notif-1', userId: 'user-1' });

      expect(result).toEqual({ updated: false });
    });

    it('throws RpcException on service failure', async () => {
      vi.mocked(mockService.markAsRead).mockRejectedValue(new Error('DB error'));

      await expect(
        controller.markRead({ notificationId: 'notif-1', userId: 'user-1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });
});
