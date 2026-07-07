import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import { INotificationRepository } from '../ports/notification.repository.port';
import { Notification, NotificationType } from '../entities/notification.entity';
import { NotificationRecipient } from '../entities/notification-recipient.entity';
import { WorkspaceMemberProjection } from '../entities/workspace-member-projection.entity';

/**
 * MikroORM implementation of `INotificationRepository`.
 *
 * All multi-row writes follow the UoW pattern: build entities, then call `em.flush()`
 * once per operation (§6, ADR-006).
 */
@Injectable()
export class MikroOrmNotificationRepository extends INotificationRepository {
  /** @param em - MikroORM `EntityManager` (request-scoped via `@mikro-orm/nestjs`). */
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** {@inheritDoc INotificationRepository.createWithRecipients} */
  async createWithRecipients(
    data: {
      id: string;
      workspaceId: string;
      type: NotificationType;
      title: string;
      message: string;
      payload?: Record<string, unknown>;
    },
    recipientIds: string[],
  ): Promise<Notification> {
    const notification = this.em.create(Notification, {
      id: data.id,
      workspaceId: data.workspaceId,
      type: data.type,
      title: data.title,
      message: data.message,
      payload: data.payload,
      createdAt: new Date(),
    });

    for (const userId of recipientIds) {
      this.em.create(NotificationRecipient, {
        id: uuidv7(),
        notification,
        userId,
        readStatus: false,
        readAt: null,
        createdAt: new Date(),
      });
    }

    await this.em.flush();
    return notification;
  }

  /** {@inheritDoc INotificationRepository.findForUser} */
  async findForUser(
    workspaceId: string,
    userId: string,
  ): Promise<Array<Notification & { readStatus: boolean; readAt: Date | null }>> {
    type Row = {
      id: string;
      workspace_id: string;
      type: string;
      title: string;
      message: string;
      payload: Record<string, unknown> | null;
      created_at: Date;
      read_status: boolean;
      read_at: Date | null;
    };

    const rows = await this.em.getConnection().execute<Row[]>(
      `SELECT n.id, n.workspace_id, n.type, n.title, n.message, n.payload, n.created_at,
                r.read_status, r.read_at
         FROM notification.notifications n
         JOIN notification.notification_recipients r
           ON r.notification_id = n.id AND r.user_id = ?
         WHERE n.workspace_id = ?
         ORDER BY n.created_at DESC
         LIMIT 50`,
      [userId, workspaceId],
    );

    return rows.map((row: Row) => {
      const n = Object.assign(new Notification(), {
        id: row.id,
        workspaceId: row.workspace_id,
        type: row.type as NotificationType,
        title: row.title,
        message: row.message,
        payload: row.payload ?? undefined,
        createdAt: row.created_at,
      });
      return Object.assign(n, { readStatus: row.read_status, readAt: row.read_at });
    });
  }

  /** {@inheritDoc INotificationRepository.markRead} */
  async markRead(notificationId: string, userId: string): Promise<boolean> {
    const recipient = await this.em.findOne(NotificationRecipient, {
      notification: notificationId,
      userId,
    });

    if (!recipient || recipient.readStatus) return false;

    recipient.readStatus = true;
    recipient.readAt = new Date();
    await this.em.flush();
    return true;
  }

  /** {@inheritDoc INotificationRepository.upsertProjectionMember} */
  async upsertProjectionMember(workspaceId: string, userId: string, role: string): Promise<void> {
    await this.em.getConnection().execute(
      `INSERT INTO notification.workspace_members_projection (workspace_id, user_id, role, synced_at)
         VALUES (?, ?, ?, now())
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, synced_at = now()`,
      [workspaceId, userId, role],
    );
  }

  /** {@inheritDoc INotificationRepository.removeProjectionMember} */
  async removeProjectionMember(workspaceId: string, userId: string): Promise<void> {
    await this.em
      .getConnection()
      .execute(
        `DELETE FROM notification.workspace_members_projection WHERE workspace_id = ? AND user_id = ?`,
        [workspaceId, userId],
      );
  }

  /** {@inheritDoc INotificationRepository.getMembersForWorkspace} */
  async getMembersForWorkspace(workspaceId: string): Promise<WorkspaceMemberProjection[]> {
    return this.em.find(WorkspaceMemberProjection, { workspaceId });
  }

  /** {@inheritDoc INotificationRepository.getDistinctProjectionWorkspaceIds} */
  async getDistinctProjectionWorkspaceIds(): Promise<string[]> {
    type Row = { workspace_id: string };
    const rows = await this.em
      .getConnection()
      .execute<Row[]>(`SELECT DISTINCT workspace_id FROM notification.workspace_members_projection`);
    return rows.map((r: Row) => r.workspace_id);
  }
}
