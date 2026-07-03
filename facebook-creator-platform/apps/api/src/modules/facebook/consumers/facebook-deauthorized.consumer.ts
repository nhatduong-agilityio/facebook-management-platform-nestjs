import { Inject, Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '../../../infrastructure/rabbitmq/rabbitmq.module';
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
 * Queue: `api.facebook.deauthorized` (durable, DLX → `fcp.dlq`)
 */
@Injectable()
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
   * @param msg - Deserialized payload from the broker.
   * @returns `undefined` on success/duplicate, or `Nack(false)` for a permanent failure.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'facebook.page.deauthorized',
    queue: 'api.facebook.deauthorized',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onPageDeauthorized(msg: FacebookDeauthorizedPayload): Promise<void | Nack> {
    return this.withDedup(msg.eventId, async () => {
      const em = this.orm.em.fork();

      const account = await em.findOne(FacebookAccount, {
        pageId: msg.pageId,
        deletedAt: null,
      });

      if (!account) {
        this.logger.log(
          { pageId: msg.pageId },
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
        { pageId: msg.pageId, accountId: account.id },
        'FacebookPageDeauthorizedConsumer: account soft-deleted and active posts cancelled',
      );
    });
  }
}
