import { Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { INotificationRepository } from './ports/notification.repository.port';
import { ISlackProvider } from './ports/slack.provider.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import type { NotificationType } from './entities/notification.entity';

/**
 * Orchestrates notification dispatch across channels (ADR-057).
 *
 * Responsibilities:
 * 1. Resolve recipient user IDs from the workspace projection.
 * 2. Persist `Notification` + `NotificationRecipient` rows.
 * 3. Optionally fire a Slack alert.
 *
 * Callers (event consumers) decide:
 * - Whether recipients are the entire workspace (`notifyWorkspace`) or a single
 *   user (`notifyUser`).
 * - Whether Slack should fire (`sendSlack`).
 */
@Injectable()
export class NotificationOrchestrator {
  /**
   * @param repo     - Persistence adapter for notification schema.
   * @param slack    - Slack webhook provider (no-op when `SLACK_WEBHOOK_URL` is unset).
   * @param internal - Internal API client used for lazy projection seeding.
   */
  constructor(
    private readonly repo: INotificationRepository,
    private readonly slack: ISlackProvider,
    private readonly internal: IInternalApiClient,
  ) {}

  /**
   * Notifies all current members of a workspace.
   *
   * Resolves recipients from `workspace_members_projection`, then persists
   * the notification and optionally sends a Slack alert.
   *
   * @param workspaceId - UUID of the workspace to notify.
   * @param type        - Notification type (routing key that triggered this).
   * @param title       - Short human-readable title.
   * @param message     - Full message body.
   * @param payload     - Optional structured payload for deep linking.
   * @param sendSlack   - If `true`, fires a Slack alert after persisting.
   */
  async notifyWorkspace(
    workspaceId: string,
    type: NotificationType,
    title: string,
    message: string,
    payload?: Record<string, unknown>,
    sendSlack = false,
  ): Promise<void> {
    let members = await this.repo.getMembersForWorkspace(workspaceId);

    /* Lazy seed: projection missing for this workspace (service deployed after workspace
       was created, or first event for a workspace the reconciler hadn't seen yet).
       Fetch from apps/api once and upsert so future events don't need to do this. */
    if (members.length === 0) {
      const fetched = await this.internal.getWorkspaceMembers(workspaceId);
      for (const m of fetched) {
        await this.repo.upsertProjectionMember(workspaceId, m.userId, m.role);
      }
      members = await this.repo.getMembersForWorkspace(workspaceId);
    }

    const recipientIds = members.map((m) => m.userId);

    if (recipientIds.length === 0) return;

    await this.repo.createWithRecipients(
      { id: uuidv7(), workspaceId, type, title, message, payload },
      recipientIds,
    );

    if (sendSlack) {
      await this.slack.sendAlert(`[${type}] ${title}: ${message}`);
    }
  }

  /**
   * Notifies a single user (may belong to multiple workspaces; workspaceId scopes the record).
   *
   * @param userId      - UUID of the recipient user.
   * @param workspaceId - UUID of the workspace the notification belongs to.
   * @param type        - Notification type.
   * @param title       - Short human-readable title.
   * @param message     - Full message body.
   * @param payload     - Optional structured payload.
   * @param sendSlack   - If `true`, fires a Slack alert after persisting.
   */
  async notifyUser(
    userId: string,
    workspaceId: string,
    type: NotificationType,
    title: string,
    message: string,
    payload?: Record<string, unknown>,
    sendSlack = false,
  ): Promise<void> {
    await this.repo.createWithRecipients(
      { id: uuidv7(), workspaceId, type, title, message, payload },
      [userId],
    );

    if (sendSlack) {
      await this.slack.sendAlert(`[${type}] ${title}: ${message}`);
    }
  }
}
