import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { NotificationService } from './notification.service';
import type { NotificationResponseDto } from './dto/notification.dto';

/**
 * TCP RPC handlers for synchronous notification operations from `apps/api` (ADR-094).
 *
 * Both handlers follow the §15 pattern: return the plain result on success;
 * throw `RpcException({ code, message })` on failure.
 *
 * BR-F08 — `readStatus` is **one-way**: marking a notification as read cannot be
 * reverted. The `notification.mark-read` pattern has no counterpart `mark-unread`
 * pattern; any such attempt must be rejected at the `apps/api` layer before reaching
 * this controller. The service's `markAsRead` returns `{ updated: false }` when the
 * notification is already read — this is a silent no-op, not an error.
 */
@Controller()
export class NotificationMessageController {
  /** @param notificationService - Application-layer notification read/write service. */
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Returns the 50 most recent notifications for `userId` in `workspaceId`.
   *
   * Pattern: `notification.list`
   * Payload: `{ workspaceId: string; userId: string }`
   * Response: `NotificationResponseDto[]`
   *
   * @param dto - RPC payload with workspace and user UUIDs.
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected service failure.
   */
  @MessagePattern('notification.list')
  async list(
    @Payload() dto: { workspaceId: string; userId: string },
  ): Promise<NotificationResponseDto[]> {
    try {
      return await this.notificationService.getNotificationsForUser(dto.workspaceId, dto.userId);
    } catch (e) {
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Notification service error',
      });
    }
  }

  /**
   * Marks a notification as read for a specific recipient (BR-F08 — one-way).
   *
   * Pattern: `notification.mark-read`
   * Payload: `{ notificationId: string; userId: string }`
   * Response: `{ updated: boolean }` — `false` when already read (silent no-op per BR-F08).
   *
   * @param dto - RPC payload with notification and user UUIDs.
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected service failure.
   */
  @MessagePattern('notification.mark-read')
  async markRead(
    @Payload() dto: { notificationId: string; userId: string },
  ): Promise<{ updated: boolean }> {
    try {
      const updated = await this.notificationService.markAsRead(dto.notificationId, dto.userId);
      return { updated };
    } catch (e) {
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Notification service error',
      });
    }
  }
}
