import type { NotificationResponseDto } from '../dto/notification.dto';

/**
 * Port: outbound client contract for the notification service.
 *
 * Transport-agnostic — bound to `NotificationHttpClientAdapter` in `NotificationModule`.
 */
export abstract class INotificationClient {
  /**
   * Returns unread and recent notifications for a specific user within a workspace.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the requesting user (recipient filter).
   */
  abstract getNotifications(
    workspaceId: string,
    userId: string,
  ): Promise<NotificationResponseDto[]>;

  /**
   * Marks a notification as read for the given recipient.
   *
   * @param notificationId - UUID of the notification record.
   * @param userId         - UUID of the recipient marking as read.
   */
  abstract markAsRead(notificationId: string, userId: string): Promise<void>;
}
