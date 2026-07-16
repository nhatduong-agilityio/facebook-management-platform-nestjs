import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';
import { FacebookService } from '../facebook.service';

/** Shape of the `facebook.token_expiring` message serialized from `FacebookTokenExpiringEvent`. */
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
 * When the daily `FacebookTokenExpiryScheduler` detects a near-expiry access token
 * it emits this event. This consumer calls `FacebookService.refreshAccountToken` to
 * exchange the stored long-lived token for a fresh one before the old one expires.
 *
 * Failure semantics:
 * - `NOT_FOUND` (account deleted / wrong workspace) → permanent nack → DLX (no retry).
 * - Any other error (network, DB timeout) → throws → base class requeues for retry.
 *
 * The plaintext token is never present in the payload (BR-F11); all decrypt/re-encrypt
 * logic is encapsulated in `FacebookService.refreshAccountToken`.
 *
 * Bound to `api_queue` via `connectMicroservice(getRmqOptions(...))` in `main.ts`.
 */
@Controller()
export class FacebookTokenExpiryConsumer extends IdempotentConsumer {
  constructor(
    @Inject(IOREDIS_CLIENT) redis: Redis,
    private readonly facebookService: FacebookService,
    private readonly logger: Logger,
  ) {
    super(redis);
  }

  /**
   * Handles a `facebook.token_expiring` event exactly once per `eventId`.
   *
   * Calls `FacebookService.refreshAccountToken` inside the dedup gate. Returns
   * `'nack'` for permanent `NOT_FOUND` failures; throws for transient errors so
   * the base class requeues the message.
   *
   * @param data - Deserialized payload from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('facebook.token_expiring')
  async onTokenExpiring(
    @Payload() data: FacebookTokenExpiringPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    await this.withDedup(data.eventId, channel, msg, async () => {
      const result = await this.facebookService.refreshAccountToken(
        data.workspaceId,
        data.accountId,
      );

      if (result.isErr()) {
        if (result.error.code === 'NOT_FOUND') {
          this.logger.warn(
            { accountId: data.accountId, workspaceId: data.workspaceId },
            'FacebookTokenExpiryConsumer: account not found — permanent nack',
          );
          return 'nack';
        }
        // Transient or unexpected error — throw so base class requeues
        throw new Error(result.error.message);
      }

      this.logger.log(
        { accountId: data.accountId, workspaceId: data.workspaceId },
        'FacebookTokenExpiryConsumer: token refreshed successfully',
      );
    });
  }
}
