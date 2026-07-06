import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Wire shape of a single audit event returned by the audit-log proxy endpoints.
 *
 * Fields mirror `services/audit AuditEvent` with PII already stripped by the consumer.
 */
export class AuditLogResponseDto {
  /** UUID v7 document id (stored as MongoDB `_id`). */
  @ApiProperty({ description: 'UUID v7 document id.' })
  _id!: string;

  /** UUID v7 carried by the original domain event; uniqueness key for idempotency. */
  @ApiProperty({ description: 'UUID v7 of the original domain event.' })
  eventId!: string;

  /** AMQP routing key (e.g. `posts.published`, `workspace.member-invited`). */
  @ApiProperty({ example: 'posts.published' })
  routingKey!: string;

  /** Workspace UUID, or `null` for platform-level events. */
  @ApiPropertyOptional({ description: 'Workspace UUID; null for platform-level events.', nullable: true })
  workspaceId!: string | null;

  /** Full event payload with PII fields stripped. */
  @ApiProperty({ description: 'Event payload with PII stripped.' })
  payload!: Record<string, unknown>;

  /** UTC timestamp when the audit service received the event. */
  @ApiProperty()
  receivedAt!: Date;
}
