import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';

/**
 * Shape of the `workspace.member-invited` event payload.
 * Mirrors `MemberInvitedEvent` in `apps/api`.
 *
 * NOTE: `email` is PII — never log it.
 */
export interface MemberInvitedPayload {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly invitationId: string;
  readonly email: string;
  readonly role: 'editor' | 'viewer';
  readonly invitedByUserId: string;
}

/**
 * Idempotent consumer for `workspace.member-invited` events.
 *
 * The projection is NOT updated here: the invited user has no `userId` in the payload
 * (only `email`). The `userId` is assigned when the invitation is accepted;
 * `member-joined` is the correct event for projection upsert.
 *
 * We still dedup the event to prevent reprocessing if the message is redelivered.
 */
@Controller()
export class MemberInvitedConsumer {
  /**
   * @param redis  - Redis client for idempotent dedup key (`dedup:notification:<eventId>`).
   * @param logger - Pino logger.
   */
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `workspace.member-invited` — dedup only; no ORM access.
   *
   * @param data - Deserialized `MemberInvitedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('workspace.member-invited')
  async onMemberInvited(
    @Payload() data: MemberInvitedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    try {
      const dedupKey = `dedup:notification:${data.eventId}`;
      const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
      if (!isNew) {
        this.logger.log({ eventId: data.eventId }, 'MemberInvitedConsumer: duplicate, skipping');
        channel.ack(msg);
        return;
      }
      /* No projection update — invitee userId unknown until invitation is accepted. */
      this.logger.log(
        { eventId: data.eventId, workspaceId: data.workspaceId },
        'MemberInvitedConsumer: deduped, no projection action needed',
      );
      channel.ack(msg);
    } catch (err) {
      this.logger.error({ eventId: data.eventId, err }, 'MemberInvitedConsumer: failed');
      channel.nack(msg, false, true);
    }
  }
}
