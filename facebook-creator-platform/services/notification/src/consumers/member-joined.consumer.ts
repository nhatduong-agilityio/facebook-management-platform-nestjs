import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
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
@Controller()
export class MemberJoinedConsumer {
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
   * Handles `workspace.member-joined` — upserts the member into the projection.
   *
   * @param data - Deserialized `MemberJoinedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('workspace.member-joined')
  async onMemberJoined(
    @Payload() data: MemberJoinedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'MemberJoinedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.repo.upsertProjectionMember(data.workspaceId, data.userId, data.role);
      });
      this.logger.log(
        { workspaceId: data.workspaceId, userId: data.userId, role: data.role },
        'MemberJoinedConsumer: projection upserted',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'MemberJoinedConsumer: upsert failed');
      channel.nack(msg, false, true);
    }
  }
}
