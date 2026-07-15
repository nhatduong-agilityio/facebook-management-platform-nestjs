import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';
import { FacebookAccount } from '../entities/facebook-account.entity';
// Cross-module entity access via EntityManager (§13 — no NestJS module dependency created)
import { Post } from '../../posts/entities/post.entity';

/** Shape of the `facebook.page.deauthorized` message. */
export interface FacebookDeauthorizedPayload {
  readonly eventId: string;
  readonly pageId: string;
  readonly occurredAt: string;
}

/**
 * Idempotent consumer for `facebook.page.deauthorized` events.
 *
 * When a Facebook Page removes our app, this consumer:
 * 1. Soft-deletes the `FacebookAccount` (sets `deletedAt = now()`).
 * 2. Bulk-transitions all `scheduled`/`publishing` posts for that page to `failed`.
 *
 * Both operations run inside a single transaction via `em.transactional()` so
 * a partial failure does not leave posts in an active state for a dead page.
 *
 * Uses `orm.em.fork()` per message (§ consumer context — no HTTP request scope).
 *
 * Bound to `api_queue` via `connectMicroservice(getRmqOptions(...))` in `main.ts`.
 */
@Controller()
export class FacebookPageDeauthorizedConsumer extends IdempotentConsumer {
  constructor(
    @Inject(IOREDIS_CLIENT) redis: Redis,
    private readonly orm: MikroORM,
    private readonly logger: Logger,
  ) {
    super(redis);
  }

  /**
   * Handles a `facebook.page.deauthorized` event exactly once per `eventId`.
   *
   * @param data - Deserialized payload from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('facebook.page.deauthorized')
  async onPageDeauthorized(
    @Payload() data: FacebookDeauthorizedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    await this.withDedup(data.eventId, channel, msg, async () => {
      const em = this.orm.em.fork();

      const account = await em.findOne(FacebookAccount, {
        pageId: data.pageId,
        deletedAt: null,
      });

      if (!account) {
        this.logger.log(
          { pageId: data.pageId },
          'FacebookPageDeauthorizedConsumer: no active account found — already deauthorized or never connected',
        );
        return;
      }

      await em.transactional(async (tx) => {
        account.deletedAt = new Date();
        // Bulk-cancel active posts for this page (cross-module entity access — §13)
        await tx.nativeUpdate(
          Post,
          {
            facebookAccount: account.id,
            status: { $in: ['scheduled', 'publishing'] },
            deletedAt: null,
          },
          {
            status: 'failed',
            lastError: 'Facebook Page deauthorized',
          },
        );
      });

      this.logger.log(
        { pageId: data.pageId, accountId: account.id },
        'FacebookPageDeauthorizedConsumer: account soft-deleted and active posts cancelled',
      );
    });
  }
}
