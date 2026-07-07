import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { SubscriptionCancelledPayload } from '@fcp/billing-contracts';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Idempotent consumer for `billing.subscription_cancelled` events.
 *
 * Notifies all workspace members in-app and fires a Slack alert (owner-critical).
 */
@Injectable()
export class BillingSubscriptionCancelledConsumer {
  /**
   * @param orm          - MikroORM instance used to create a per-message request context.
   * @param orchestrator - Handles notification persistence and Slack dispatch.
   * @param redis        - Redis client for idempotent dedup.
   * @param logger       - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `billing.subscription_cancelled`.
   *
   * @param msg - Deserialized `SubscriptionCancelledPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'billing.subscription_cancelled',
    queue: 'notification.billing.subscription_cancelled',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onSubscriptionCancelled(msg: SubscriptionCancelledPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'BillingSubscriptionCancelledConsumer: duplicate, skipping');
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          msg.workspaceId,
          'billing.subscription_cancelled',
          'Subscription cancelled',
          `Your ${msg.planCode} subscription has been cancelled.`,
          { planCode: msg.planCode },
          true,
        );
      });
      this.logger.log({ workspaceId: msg.workspaceId, eventId: msg.eventId }, 'BillingSubscriptionCancelledConsumer: notified');
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'BillingSubscriptionCancelledConsumer: failed');
      throw err;
    }
  }
}
