import type { Notification, NotificationType } from '../entities/notification.entity';
import type { WorkspaceMemberProjection } from '../entities/workspace-member-projection.entity';

/**
 * Port: persistence contract for all notification-schema operations.
 *
 * Bound to `MikroOrmNotificationRepository` in `NotificationModule`.
 * No `Result` wrapper — all writes are called inside `NotificationOrchestrator`
 * which catches thrown errors at the consumer level.
 */
export abstract class INotificationRepository {
  /**
   * Creates a `Notification` and its `NotificationRecipient` rows in a single flush.
   *
   * @param data        - Notification fields.
   * @param recipientIds - UUIDs of users who should receive the notification.
   */
  abstract createWithRecipients(
    data: {
      id: string;
      workspaceId: string;
      type: NotificationType;
      title: string;
      message: string;
      payload?: Record<string, unknown>;
    },
    recipientIds: string[],
  ): Promise<Notification>;

  /**
   * Returns notifications and their read status for a specific user in a workspace,
   * most recent first (limit 50).
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the requesting user.
   */
  abstract findForUser(
    workspaceId: string,
    userId: string,
  ): Promise<Array<Notification & { readStatus: boolean; readAt: Date | null }>>;

  /**
   * Marks a `NotificationRecipient` as read.
   *
   * No-op if already read (BR-F08 — one-way at application layer).
   *
   * @param notificationId - UUID of the notification.
   * @param userId         - UUID of the recipient.
   * @returns `true` if the row was updated; `false` if not found or already read.
   */
  abstract markRead(notificationId: string, userId: string): Promise<boolean>;

  /**
   * Inserts or updates a workspace member projection row.
   *
   * Used by projection consumers and cold-start reconciliation.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the member.
   * @param role        - Current role of the member.
   */
  abstract upsertProjectionMember(
    workspaceId: string,
    userId: string,
    role: string,
  ): Promise<void>;

  /**
   * Removes a workspace member projection row.
   *
   * No-op if the row does not exist.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the member.
   */
  abstract removeProjectionMember(workspaceId: string, userId: string): Promise<void>;

  /**
   * Returns all members of a workspace from the projection table.
   *
   * @param workspaceId - UUID of the workspace.
   */
  abstract getMembersForWorkspace(workspaceId: string): Promise<WorkspaceMemberProjection[]>;

  /**
   * Returns all distinct workspace IDs present in the projection table.
   *
   * Used by `WorkspaceMemberReconciler` to know which workspaces to reconcile.
   */
  abstract getDistinctProjectionWorkspaceIds(): Promise<string[]>;
}
