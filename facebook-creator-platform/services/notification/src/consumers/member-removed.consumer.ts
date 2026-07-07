import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { INotificationRepository } from '../ports/notification.repository.port';

/**
 * Shape of the `workspace.member-removed` event payload.
 * Mirrors `MemberRemovedEvent` in `apps/api`.
 */
export interface MemberRemovedPayload {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly removedUserId: string;
  readonly removedByUserId: string;
}

/**
 * Idempotent consumer for `workspace.member-removed` events.
 *
 * Deletes the projection row for `(workspaceId, removedUserId)` so the removed
 * member no longer receives workspace notifications.
 */
@Injectable()
export class MemberRemovedConsumer {
  /**
   * @param repo   - Notification repository for projection delete.
   * @param redis  - Redis client for idempotent dedup.
   * @param logger - Pino logger.
   */
  constructor(
    private readonly repo: INotificationRepository,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `workspace.member-removed` — removes the member from the projection.
   *
   * @param msg - Deserialized `MemberRemovedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'workspace.member-removed',
    queue: 'notification.workspace.member-removed',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onMemberRemoved(msg: MemberRemovedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'MemberRemovedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.repo.removeProjectionMember(msg.workspaceId, msg.removedUserId);
      this.logger.log(
        { workspaceId: msg.workspaceId, userId: msg.removedUserId },
        'MemberRemovedConsumer: projection row removed',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'MemberRemovedConsumer: delete failed');
      throw err;
    }
  }
}
