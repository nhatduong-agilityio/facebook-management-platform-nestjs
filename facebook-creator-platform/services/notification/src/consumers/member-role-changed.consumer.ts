import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { INotificationRepository } from '../ports/notification.repository.port';

/**
 * Shape of the `workspace.role-changed` event payload.
 * Mirrors `MemberRoleChangedEvent` in `apps/api`.
 */
export interface MemberRoleChangedPayload {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly oldRole: string;
  readonly newRole: string;
  readonly changedByUserId: string;
}

/**
 * Idempotent consumer for `workspace.role-changed` events.
 *
 * Updates the `role` column in `workspace_members_projection` to reflect the
 * new role so future workspace fan-outs target the correct set of members.
 */
@Injectable()
export class MemberRoleChangedConsumer {
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
   * Handles `workspace.role-changed` — updates the member's role in the projection.
   *
   * @param msg - Deserialized `MemberRoleChangedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'workspace.role-changed',
    queue: 'notification.workspace.role-changed',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onMemberRoleChanged(msg: MemberRoleChangedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'MemberRoleChangedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.repo.upsertProjectionMember(msg.workspaceId, msg.userId, msg.newRole);
      this.logger.log(
        { workspaceId: msg.workspaceId, userId: msg.userId, newRole: msg.newRole },
        'MemberRoleChangedConsumer: projection role updated',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'MemberRoleChangedConsumer: upsert failed');
      throw err;
    }
  }
}
