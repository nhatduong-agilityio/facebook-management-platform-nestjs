import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { AppError } from '../../common/errors/app-error';
import { DownstreamServiceError } from '../../common/http/http-client.port';
import { INotificationClient } from './ports/notification.client.port';
import { NotificationResponseDto } from './dto/notification.dto';

/** Maps a caught downstream error to a clean `AppError`. */
function mapDownstreamError(e: unknown): AppError {
  if (e instanceof DownstreamServiceError) {
    return e.status >= 500
      ? AppError.serviceUnavailable('Notification service')
      : AppError.internal(`Notification service responded with unexpected ${e.status}`);
  }
  return AppError.internal('Unexpected error from notification service');
}

/**
 * Proxy notification endpoints in `apps/api`.
 *
 * Enforces Clerk JWT + workspace role guard, then forwards to `services/notification`
 * via `INotificationClient → NotificationHttpClientAdapter`.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, WorkspaceRolesGuard)
@Roles('owner', 'editor', 'viewer')
@Controller()
export class NotificationController {
  /** @param notificationClient - Transport-agnostic client for the notification service. */
  constructor(private readonly notificationClient: INotificationClient) {}

  /**
   * Returns unread and recent notifications for the authenticated user in a workspace.
   *
   * @param workspaceId - UUID of the workspace (from URL; also read by auth guard).
   * @param user        - Authenticated user injected by `ClerkAuthGuard`.
   */
  @Get('workspaces/:workspaceId/notifications')
  @ApiOperation({ summary: 'Get notifications for the current user in a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Clerk JWT.' })
  @ApiForbiddenResponse({ description: 'User is not a member of this workspace.' })
  @ApiServiceUnavailableResponse({ description: 'Notification service is unreachable.' })
  async getNotifications(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
  ): Promise<NotificationResponseDto[]> {
    try {
      return await this.notificationClient.getNotifications(workspaceId, user.id);
    } catch (e) {
      throw toHttpException(mapDownstreamError(e));
    }
  }

  /**
   * Marks a notification as read for the authenticated user (BR-F08 — one-way).
   *
   * @param notificationId - UUID of the notification record.
   * @param user           - Authenticated user injected by `ClerkAuthGuard`.
   */
  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark a notification as read (one-way — BR-F08)' })
  @ApiParam({ name: 'notificationId', description: 'Notification UUID' })
  @ApiOkResponse({ description: 'Marked as read.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Clerk JWT.' })
  @ApiServiceUnavailableResponse({ description: 'Notification service is unreachable.' })
  async markAsRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: { id: string },
  ): Promise<void> {
    try {
      await this.notificationClient.markAsRead(notificationId, user.id);
    } catch (e) {
      throw toHttpException(mapDownstreamError(e));
    }
  }
}
