import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';

/**
 * Shape of the `posts.published` event payload.
 * Mirrors `PostPublishedEvent` in `apps/api`.
 */
export interface PostPublishedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly facebookGraphPostId: string;
  readonly facebookAccountId: string;
  readonly createdByUserId: string;
}

/**
 * Idempotent consumer for `posts.published`.
 *
 * Sends a `publish_success` email to the post author.
 * Recipient email resolved via `GET /internal/users/:id` on `apps/api` (ADR-050).
 * Permanent failures are nacked without requeue (DLX → `fcp.dlq`); transient
 * failures are requeued for immediate retry.
 */
@Controller()
export class PostPublishedEmailConsumer {
  /**
   * @param orm           - MikroORM instance used to create a per-message request context.
   * @param internalApi   - Resolves user email from `apps/api`.
   * @param emailProvider - Delivers the email via the configured provider.
   * @param emailLogRepo  - Persists `EmailDeliveryLog` rows.
   * @param redis         - Redis client for idempotent dedup.
   * @param logger        - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly internalApi: IInternalApiClient,
    private readonly emailProvider: IEmailProvider,
    private readonly emailLogRepo: IEmailDeliveryLogRepository,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `posts.published` — sends a publish-success email to the post author.
   *
   * @param data - Deserialized `PostPublishedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.published')
  async onPostPublished(
    @Payload() data: PostPublishedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:email:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostPublishedEmailConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    let logId: string | undefined;

    try {
      const recipientEmail = await this.internalApi.getUserEmail(data.createdByUserId);

      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: data.workspaceId,
          userId: data.createdByUserId,
          emailType: 'publish_success',
          recipientEmail,
          templateName: 'post-published',
          provider: 'Resend',
          dedupeKey: `${data.eventId}:${recipientEmail}`,
          relatedEntityType: 'post',
          relatedEntityId: data.postId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: recipientEmail,
          templateName: 'post-published',
          data: { postId: data.postId, facebookGraphPostId: data.facebookGraphPostId },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });

      this.logger.log({ eventId: data.eventId }, 'PostPublishedEmailConsumer: sent');
      channel.ack(msg);
    } catch (err) {
      if (err instanceof PermanentEmailError) {
        if (logId) {
          await RequestContext.create(this.orm.em, async () => {
            await this.emailLogRepo.updateFailed(logId!, 1);
          });
        }
        this.logger.error(
          { eventId: data.eventId, isPermanent: true },
          'PostPublishedEmailConsumer: routing to DLQ',
        );
        channel.nack(msg, false, false);
      } else {
        await this.redis.del(dedupKey);
        this.logger.warn(
          { eventId: data.eventId },
          'PostPublishedEmailConsumer: transient failure, scheduling retry',
        );
        channel.nack(msg, false, true);
      }
    }
  }
}
