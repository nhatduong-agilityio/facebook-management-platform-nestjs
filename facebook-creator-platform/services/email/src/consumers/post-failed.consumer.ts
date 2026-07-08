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
 * Shape of the `posts.failed` event payload.
 * Mirrors `PostFailedEvent` in `apps/api`.
 */
export interface PostFailedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly createdByUserId: string;
  readonly lastError?: string;
}

/** Name of the AMQP queue this consumer owns; used for x-death counting. */
const QUEUE_NAME = 'email.posts.failed';

/**
 * Idempotent consumer for `posts.failed`.
 *
 * Sends a `publish_failed` email to the post author.
 * Recipient email resolved via `GET /internal/users/:id` on `apps/api` (ADR-050).
 * Transient failures are retried up to `MAX_EMAIL_RETRIES` times via `fcp.retry`
 * (30 s TTL); permanent failures and exhausted retries go to `fcp.dlq`.
 */
@Injectable()
export class PostFailedEmailConsumer {
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
   * Handles `posts.failed` — sends a publish-failure email to the post author.
   *
   * @param msg     - Deserialized `PostFailedPayload`.
   * @param amqpMsg - Raw AMQP message; provides `x-death` headers for retry counting.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.failed',
    queue: QUEUE_NAME,
    queueOptions: { durable: true, deadLetterExchange: 'fcp.retry' },
  })
  async onPostFailed(msg: PostFailedPayload, amqpMsg: ConsumeMessage): Promise<void | Nack> {
    const deathCount = getDeathCount(amqpMsg, QUEUE_NAME);
    const dedupKey = `dedup:email:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostFailedEmailConsumer: duplicate, skipping');
      return;
    }

    let logId: string | undefined;

    try {
      const recipientEmail = await this.internalApi.getUserEmail(msg.createdByUserId);
      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: msg.workspaceId,
          userId: msg.createdByUserId,
          emailType: 'publish_failed',
          recipientEmail,
          templateName: 'post-failed',
          provider: 'Resend',
          dedupeKey: `${msg.eventId}:${recipientEmail}`,
          relatedEntityType: 'post',
          relatedEntityId: msg.postId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: recipientEmail,
          templateName: 'post-failed',
          data: { postId: msg.postId, lastError: msg.lastError ?? 'Unknown error' },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });
      this.logger.log({ eventId: msg.eventId }, 'PostFailedEmailConsumer: sent');
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
          'PostFailedEmailConsumer: routing to DLQ',
        );
        return; // Ack
      }

      await this.redis.del(dedupKey);
      this.logger.warn(
        { eventId: msg.eventId, attempt: deathCount + 1 },
        'PostFailedEmailConsumer: transient failure, scheduling retry',
      );
      return new Nack(false);
    }
  }
}
