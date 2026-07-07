import { Injectable } from '@nestjs/common';
import { INotificationRepository } from './ports/notification.repository.port';
import type { NotificationResponseDto } from './dto/notification.dto';

/**
 * Application-layer service for the notification read API.
 *
 * Exposes `getNotificationsForUser` (paginated list, most recent first) and
 * `markAsRead` (BR-F08 one-way enforcement at application layer).
 *
 * Producers (event consumers) use `NotificationOrchestrator` directly — this
 * service is only for the HTTP read path.
 */
@Injectable()
export class NotificationService {
  /** @param repo - Persistence adapter for notification schema. */
  constructor(private readonly repo: INotificationRepository) {}

  /**
   * Returns the 50 most recent notifications for `userId` in `workspaceId`,
   * with per-user `readStatus` and `readAt` joined from `notification_recipients`.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the requesting user.
   */
  async getNotificationsForUser(
    workspaceId: string,
    userId: string,
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.repo.findForUser(workspaceId, userId);
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      type: r.type,
      title: r.title,
      message: r.message,
      payload: r.payload,
      readStatus: r.readStatus,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Marks a notification as read for a specific recipient.
   *
   * BR-F08: `readStatus` is one-way — already-read notifications are silently ignored.
   * Returns `true` if the row was updated, `false` if not found or already read.
   *
   * @param notificationId - UUID of the notification.
   * @param userId         - UUID of the recipient marking as read.
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    return this.repo.markRead(notificationId, userId);
  }
}
