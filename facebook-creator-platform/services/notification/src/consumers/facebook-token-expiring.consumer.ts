import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Shape of the `facebook.token_expiring` event payload.
 * Mirrors `FacebookTokenExpiringEvent` in `apps/api`.
 * No PII — access token is never in the payload (BR-F11).
 */
export interface FacebookTokenExpiringPayload {
  readonly eventId: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly pageId: string;
  readonly tokenExpiresAt: string;
}

/**
 * Idempotent consumer for `facebook.token_expiring` events.
 *
 * Notifies all workspace members in-app (no Slack — informational reminder).
 * The Email Service (T4.3) sends the actual renewal email; this adds an in-app
 * companion notification.
 */
@Injectable()
export class FacebookTokenExpiringConsumer {
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
   * Handles `facebook.token_expiring` — notifies workspace members.
   *
   * @param msg - Deserialized `FacebookTokenExpiringPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'facebook.token_expiring',
    queue: 'notification.facebook.token_expiring',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onTokenExpiring(msg: FacebookTokenExpiringPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'FacebookTokenExpiringConsumer: duplicate, skipping');
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          msg.workspaceId,
          'facebook.token_expiring',
          'Facebook token expiring soon',
          `Your Facebook Page connection token expires on ${new Date(msg.tokenExpiresAt).toLocaleDateString()}. Please reconnect your Page.`,
          { accountId: msg.accountId, pageId: msg.pageId, tokenExpiresAt: msg.tokenExpiresAt },
          false,
        );
      });
      this.logger.log({ accountId: msg.accountId, eventId: msg.eventId }, 'FacebookTokenExpiringConsumer: notified');
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'FacebookTokenExpiringConsumer: failed');
      throw err;
    }
  }
}
