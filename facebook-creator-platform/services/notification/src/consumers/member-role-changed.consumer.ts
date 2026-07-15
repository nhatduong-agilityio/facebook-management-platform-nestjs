import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
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
@Controller()
export class MemberRoleChangedConsumer {
  /**
   * @param orm    - MikroORM instance used to create a per-message request context.
   * @param repo   - Notification repository for projection upsert.
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
   * Handles `workspace.role-changed` — updates the member's role in the projection.
   *
   * @param data - Deserialized `MemberRoleChangedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('workspace.role-changed')
  async onMemberRoleChanged(
    @Payload() data: MemberRoleChangedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'MemberRoleChangedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.repo.upsertProjectionMember(data.workspaceId, data.userId, data.newRole);
      });
      this.logger.log(
        { workspaceId: data.workspaceId, userId: data.userId, newRole: data.newRole },
        'MemberRoleChangedConsumer: projection role updated',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'MemberRoleChangedConsumer: upsert failed');
      channel.nack(msg, false, true);
    }
  }
}
