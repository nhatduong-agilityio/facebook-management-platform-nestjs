import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
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
@Controller()
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
   * @param data - Deserialized `FacebookTokenExpiringPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('facebook.token_expiring')
  async onTokenExpiring(
    @Payload() data: FacebookTokenExpiringPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'FacebookTokenExpiringConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          data.workspaceId,
          'facebook.token_expiring',
          'Facebook token expiring soon',
          `Your Facebook Page connection token expires on ${new Date(data.tokenExpiresAt).toLocaleDateString()}. Please reconnect your Page.`,
          { accountId: data.accountId, pageId: data.pageId, tokenExpiresAt: data.tokenExpiresAt },
          false,
        );
      });
      this.logger.log({ accountId: data.accountId, eventId: data.eventId }, 'FacebookTokenExpiringConsumer: notified');
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'FacebookTokenExpiringConsumer: failed');
      channel.nack(msg, false, true);
    }
  }
}
