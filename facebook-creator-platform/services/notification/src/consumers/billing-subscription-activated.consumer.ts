import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
import type { SubscriptionActivatedPayload } from '@fcp/billing-contracts';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Idempotent consumer for `billing.subscription_activated` events.
 *
 * Notifies all workspace members in-app (no Slack — informational only).
 */
@Controller()
export class BillingSubscriptionActivatedConsumer {
  /**
   * @param orm          - MikroORM instance used to create a per-message request context.
   * @param orchestrator - Handles notification persistence.
   * @param redis        - Redis client for idempotent dedup.
   * @param logger       - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly orchestrator: NotificationOrchestrator,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `billing.subscription_activated`.
   *
   * @param data - Deserialized `SubscriptionActivatedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('billing.subscription_activated')
  async onSubscriptionActivated(
    @Payload() data: SubscriptionActivatedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'BillingSubscriptionActivatedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          data.workspaceId,
          'billing.subscription_activated',
          'Subscription activated',
          `Your ${data.planCode} subscription is now active.`,
          { planCode: data.planCode },
          false,
        );
      });
      this.logger.log({ workspaceId: data.workspaceId, eventId: data.eventId }, 'BillingSubscriptionActivatedConsumer: notified');
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'BillingSubscriptionActivatedConsumer: failed');
      channel.nack(msg, false, true);
    }
  }
}
