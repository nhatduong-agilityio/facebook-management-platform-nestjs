import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { SubscriptionActivatedPayload } from '@fcp/billing-contracts';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Idempotent consumer for `billing.subscription_activated` events.
 *
 * Notifies all workspace members in-app (no Slack — informational only).
 */
@Injectable()
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
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `billing.subscription_activated`.
   *
   * @param msg - Deserialized `SubscriptionActivatedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'billing.subscription_activated',
    queue: 'notification.billing.subscription_activated',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onSubscriptionActivated(msg: SubscriptionActivatedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'BillingSubscriptionActivatedConsumer: duplicate, skipping');
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          msg.workspaceId,
          'billing.subscription_activated',
          'Subscription activated',
          `Your ${msg.planCode} subscription is now active.`,
          { planCode: msg.planCode },
          false,
        );
      });
      this.logger.log({ workspaceId: msg.workspaceId, eventId: msg.eventId }, 'BillingSubscriptionActivatedConsumer: notified');
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'BillingSubscriptionActivatedConsumer: failed');
      throw err;
    }
  }
}
