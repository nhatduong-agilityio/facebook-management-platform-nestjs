import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { NotificationResponseDto } from './dto/notification.dto';
import { WorkspaceMemberReconciler } from './reconciliation/workspace-member.reconciler';

/**
 * Internal HTTP API for the notification service.
 *
 * **Not** guarded by Clerk JWT — `apps/api` proxy enforces Clerk auth and RBAC
 * before forwarding here. Endpoint-level auth is the internal network boundary.
 */
@ApiTags('notifications-internal')
@Controller()
export class NotificationController {
  /**
   * @param notificationService - Application-layer notification read service.
   * @param reconciler          - Workspace member projection reconciler.
   */
  constructor(
    private readonly notificationService: NotificationService,
    private readonly reconciler: WorkspaceMemberReconciler,
  ) {}

  /**
   * Returns the 50 most recent notifications for a user in a workspace.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the requesting user (passed from `apps/api` proxy).
   */
  @Get('workspaces/:workspaceId/notifications')
  @ApiOperation({ summary: 'Get notifications for a user in a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiQuery({ name: 'userId', description: 'Recipient user UUID' })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  async getNotifications(
    @Param('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
  ): Promise<NotificationResponseDto[]> {
    return this.notificationService.getNotificationsForUser(workspaceId, userId);
  }

  /**
   * Marks a notification as read for a user (BR-F08 — one-way).
   *
   * @param notificationId - UUID of the notification record.
   * @param body           - `{ userId }` of the recipient.
   */
  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark notification as read (BR-F08)' })
  @ApiParam({ name: 'notificationId', description: 'Notification UUID' })
  @ApiOkResponse({ description: 'Marked as read or already read.' })
  async markAsRead(
    @Param('notificationId') notificationId: string,
    @Body() body: { userId: string },
  ): Promise<void> {
    await this.notificationService.markAsRead(notificationId, body.userId);
  }

  /**
   * Seeds the workspace member projection for a specific workspace by calling
   * `apps/api GET /internal/workspaces/:id/members`.
   *
   * Use this once per workspace after a first-boot to backfill members that
   * joined before the notification service was deployed. Idempotent — safe to
   * call multiple times (upserts rows).
   *
   * @param workspaceId - UUID of the workspace to seed.
   */
  @Post('internal/workspaces/:workspaceId/seed-projection')
  @HttpCode(200)
  @ApiOperation({ summary: 'Seed workspace member projection (dev/ops utility)' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiOkResponse({ description: 'Projection seeded.' })
  async seedProjection(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ seeded: number }> {
    return this.reconciler.reconcileWorkspace(workspaceId);
  }
}
