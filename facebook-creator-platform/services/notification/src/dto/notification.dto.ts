import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shape of a single notification row returned by `GET /workspaces/:id/notifications`.
 *
 * Includes recipient-scoped `readStatus` and `readAt` derived from the
 * `notification_recipients` join.
 */
export class NotificationResponseDto {
  /** UUID v7 of the notification record. */
  @ApiProperty()
  id!: string;

  /** UUID of the workspace this notification belongs to. */
  @ApiProperty()
  workspaceId!: string;

  /** Notification type (maps to the event routing key that produced it). */
  @ApiProperty()
  type!: string;

  /** Short human-readable title (max 150 chars). */
  @ApiProperty()
  title!: string;

  /** Full notification message body. */
  @ApiProperty()
  message!: string;

  /** Optional structured event payload for rendering or deep linking. */
  @ApiPropertyOptional()
  payload?: Record<string, unknown>;

  /** Whether the requesting user has read this notification (BR-F08 — one-way). */
  @ApiProperty()
  readStatus!: boolean;

  /** ISO timestamp when the notification was read, or `null` if unread. */
  @ApiPropertyOptional()
  readAt?: string | null;

  /** ISO timestamp when the notification was created. */
  @ApiProperty()
  createdAt!: string;
}
