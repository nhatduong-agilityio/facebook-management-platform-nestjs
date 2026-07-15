import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
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
@Controller()
export class MemberRemovedConsumer {
  /**
   * @param orm    - MikroORM instance used to create a per-message request context.
   * @param repo   - Notification repository for projection delete.
   * @param redis  - Redis client for idempotent dedup.
   * @param logger - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly repo: INotificationRepository,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `workspace.member-removed` — removes the member from the projection.
   *
   * @param data - Deserialized `MemberRemovedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('workspace.member-removed')
  async onMemberRemoved(
    @Payload() data: MemberRemovedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'MemberRemovedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.repo.removeProjectionMember(data.workspaceId, data.removedUserId);
      });
      this.logger.log(
        { workspaceId: data.workspaceId, userId: data.removedUserId },
        'MemberRemovedConsumer: projection row removed',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'MemberRemovedConsumer: delete failed');
      channel.nack(msg, false, true);
    }
  }
}
