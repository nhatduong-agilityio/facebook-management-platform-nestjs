import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { INotificationRepository } from '../ports/notification.repository.port';

/**
 * Shape of the `workspace.member-joined` event payload.
 * Mirrors `MemberJoinedEvent` in `apps/api`.
 */
export interface MemberJoinedPayload {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: 'editor' | 'viewer';
  readonly invitationId: string;
}

/**
 * Idempotent consumer for `workspace.member-joined` events.
 *
 * Upserts `(workspaceId, userId, role)` into `workspace_members_projection` so
 * the Notification Service can fan-out notifications to workspace members without
 * calling `apps/api` on every event (ADR-051).
 */
@Injectable()
export class MemberJoinedConsumer {
  /**
   * @param repo   - Notification repository for projection upsert.
   * @param redis  - Redis client for idempotent dedup.
   * @param logger - Pino logger.
   */
  constructor(
    private readonly repo: INotificationRepository,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `workspace.member-joined` — upserts the member into the projection.
   *
   * @param msg - Deserialized `MemberJoinedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'workspace.member-joined',
    queue: 'notification.workspace.member-joined',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onMemberJoined(msg: MemberJoinedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'MemberJoinedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.repo.upsertProjectionMember(msg.workspaceId, msg.userId, msg.role);
      this.logger.log(
        { workspaceId: msg.workspaceId, userId: msg.userId, role: msg.role },
        'MemberJoinedConsumer: projection upserted',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'MemberJoinedConsumer: upsert failed');
      throw err;
    }
  }
}
