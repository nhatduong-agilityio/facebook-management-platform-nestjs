import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';

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
@Injectable()
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
   * Handles `workspace.member-invited` — dedup only.
   *
   * @param msg - Deserialized `MemberInvitedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'workspace.member-invited',
    queue: 'notification.workspace.member-invited',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onMemberInvited(msg: MemberInvitedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'MemberInvitedConsumer: duplicate, skipping');
      return;
    }
    /* No projection update — invitee userId unknown until invitation is accepted. */
    this.logger.log(
      { eventId: msg.eventId, workspaceId: msg.workspaceId },
      'MemberInvitedConsumer: deduped, no projection action needed',
    );
  }
}
