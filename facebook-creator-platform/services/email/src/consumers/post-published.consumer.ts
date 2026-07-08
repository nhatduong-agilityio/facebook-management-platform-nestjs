import { Injectable } from '@nestjs/common';
import { AmqpConnection, RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { ConsumeMessage } from 'amqplib';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';
import { getDeathCount, MAX_EMAIL_RETRIES } from '../utils/email-retry.util';

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

/** Name of the AMQP queue this consumer owns; used for x-death counting. */
const QUEUE_NAME = 'email.posts.published';

/**
 * Idempotent consumer for `posts.published`.
 *
 * Sends a `publish_success` email to the post author.
 * Recipient email resolved via `GET /internal/users/:id` on `apps/api` (ADR-050).
 * Transient failures are retried up to `MAX_EMAIL_RETRIES` times via `fcp.retry`
 * (30 s TTL); permanent failures and exhausted retries go to `fcp.dlq`.
 */
@Injectable()
export class PostPublishedEmailConsumer {
  /**
   * @param orm            - MikroORM instance used to create a per-message request context.
   * @param internalApi    - Resolves user email from `apps/api`.
   * @param emailProvider  - Delivers the email via the configured provider.
   * @param emailLogRepo   - Persists `EmailDeliveryLog` rows.
   * @param redis          - Redis client for idempotent dedup.
   * @param logger         - Pino logger.
   * @param amqpConnection - AMQP connection used to publish failed messages to `fcp.dlq`.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly internalApi: IInternalApiClient,
    private readonly emailProvider: IEmailProvider,
    private readonly emailLogRepo: IEmailDeliveryLogRepository,
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  /**
   * Handles `posts.published` — sends a publish-success email to the post author.
   *
   * @param msg     - Deserialized `PostPublishedPayload`.
   * @param amqpMsg - Raw AMQP message; provides `x-death` headers for retry counting.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.published',
    queue: QUEUE_NAME,
    queueOptions: { durable: true, deadLetterExchange: 'fcp.retry' },
  })
  async onPostPublished(msg: PostPublishedPayload, amqpMsg: ConsumeMessage): Promise<void | Nack> {
    const deathCount = getDeathCount(amqpMsg, QUEUE_NAME);
    const dedupKey = `dedup:email:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostPublishedEmailConsumer: duplicate, skipping');
      return;
    }

    let logId: string | undefined;

    try {
      const recipientEmail = await this.internalApi.getUserEmail(msg.createdByUserId);
      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: msg.workspaceId,
          userId: msg.createdByUserId,
          emailType: 'publish_success',
          recipientEmail,
          templateName: 'post-published',
          provider: 'Resend',
          dedupeKey: `${msg.eventId}:${recipientEmail}`,
          relatedEntityType: 'post',
          relatedEntityId: msg.postId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: recipientEmail,
          templateName: 'post-published',
          data: { postId: msg.postId, facebookGraphPostId: msg.facebookGraphPostId },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });
      this.logger.log({ eventId: msg.eventId }, 'PostPublishedEmailConsumer: sent');
    } catch (err) {
      const isPermanent = err instanceof PermanentEmailError;
      const isExhausted = deathCount >= MAX_EMAIL_RETRIES;

      if (isPermanent || isExhausted) {
        if (logId) {
          await RequestContext.create(this.orm.em, async () => {
            await this.emailLogRepo.updateFailed(logId!, deathCount + 1);
          });
        }
        await this.amqpConnection.publish('fcp.dlq', 'dead', msg, {
          headers: amqpMsg.properties.headers,
        });
        this.logger.error(
          { eventId: msg.eventId, deathCount, isPermanent, isExhausted },
          'PostPublishedEmailConsumer: routing to DLQ',
        );
        return; // Ack
      }

      await this.redis.del(dedupKey);
      this.logger.warn(
        { eventId: msg.eventId, attempt: deathCount + 1 },
        'PostPublishedEmailConsumer: transient failure, scheduling retry',
      );
      return new Nack(false);
    }
  }
}
