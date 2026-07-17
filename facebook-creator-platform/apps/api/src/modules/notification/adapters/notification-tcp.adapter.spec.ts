import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { NotificationTcpAdapter } from './notification-tcp.adapter';
import { DownstreamServiceError } from '../../../common/http/http-client.port';
import type { NotificationResponseDto } from '../dto/notification.dto';

const makeNotification = (): NotificationResponseDto => ({
  id: 'n-1',
  workspaceId: 'ws-1',
  type: 'posts.published',
  title: 'Post published',
  message: 'Your post was published.',
  readStatus: false,
  createdAt: '2026-07-17T00:00:00.000Z',
});

describe('NotificationTcpAdapter', () => {
  let adapter: NotificationTcpAdapter;
  let client: ClientProxy;

  beforeEach(() => {
    client = { send: vi.fn() } as unknown as ClientProxy;
    adapter = new NotificationTcpAdapter(client);
  });

  // ---------------------------------------------------------------------------
  // getNotifications
  // ---------------------------------------------------------------------------

  describe('getNotifications', () => {
    it('returns NotificationResponseDto[] from the notification service', async () => {
      vi.mocked(client.send).mockReturnValue(of([makeNotification()]));

      const result = await adapter.getNotifications('ws-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('n-1');
      expect(client.send).toHaveBeenCalledWith('notification.list', {
        workspaceId: 'ws-1',
        userId: 'user-1',
      });
    });

    it('throws DownstreamServiceError(500) on RpcException', async () => {
      vi.mocked(client.send).mockReturnValue(
        throwError(() => new RpcException({ code: 'INTERNAL', message: 'DB error' })),
      );

      await expect(adapter.getNotifications('ws-1', 'user-1')).rejects.toMatchObject({
        status: 500,
      });
    });

    it('throws DownstreamServiceError(503) on TCP timeout or connection failure', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await expect(adapter.getNotifications('ws-1', 'user-1')).rejects.toBeInstanceOf(
        DownstreamServiceError,
      );
      await expect(adapter.getNotifications('ws-1', 'user-1')).rejects.toMatchObject({
        status: 503,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // markAsRead
  // ---------------------------------------------------------------------------

  describe('markAsRead', () => {
    it('resolves void when the notification is marked as read', async () => {
      vi.mocked(client.send).mockReturnValue(of({ updated: true }));

      await expect(adapter.markAsRead('n-1', 'user-1')).resolves.toBeUndefined();
      expect(client.send).toHaveBeenCalledWith('notification.mark-read', {
        notificationId: 'n-1',
        userId: 'user-1',
      });
    });

    it('throws DownstreamServiceError(500) on RpcException', async () => {
      vi.mocked(client.send).mockReturnValue(
        throwError(() => new RpcException({ code: 'INTERNAL', message: 'DB error' })),
      );

      await expect(adapter.markAsRead('n-1', 'user-1')).rejects.toMatchObject({ status: 500 });
    });
  });
});
