import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shape of a single notification returned by `GET /workspaces/:id/notifications`.
 */
export class NotificationResponseDto {
  /** UUID of the notification record. */
  @ApiProperty()
  id!: string;

  /** UUID of the workspace the notification belongs to. */
  @ApiProperty()
  workspaceId!: string;

  /** Notification type (e.g. `posts.published`, `billing.payment_failed`). */
  @ApiProperty()
  type!: string;

  /** Short human-readable title. */
  @ApiProperty()
  title!: string;

  /** Full notification message body. */
  @ApiProperty()
  message!: string;

  /** Optional structured payload (varies per notification type). */
  @ApiPropertyOptional()
  payload?: Record<string, unknown>;

  /** Whether the requesting user has read this notification. */
  @ApiProperty()
  readStatus!: boolean;

  /** ISO timestamp when the notification was read, or null. */
  @ApiPropertyOptional()
  readAt?: string;

  /** ISO timestamp when the notification was created. */
  @ApiProperty()
  createdAt!: string;
}
