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
 * Shape of the `facebook.token_expiring` event payload.
 * Mirrors `FacebookTokenExpiringEvent` in `apps/api`.
 */
export interface FacebookTokenExpiringPayload {
  readonly eventId: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly pageId: string;
  readonly tokenExpiresAt: string;
}

/** Name of the AMQP queue this consumer owns; used for x-death counting. */
const QUEUE_NAME = 'email.facebook.token_expiring';

/**
 * Idempotent consumer for `facebook.token_expiring`.
 *
 * Sends a `token_expiring` reminder email to the workspace owner.
 * Recipient email resolved via `GET /internal/workspaces/:id` on `apps/api` (ADR-050, ADR-053).
 * Transient failures are retried up to `MAX_EMAIL_RETRIES` times via `fcp.retry`
 * (30 s TTL); permanent failures and exhausted retries go to `fcp.dlq`.
 */
@Injectable()
export class FacebookTokenExpiringEmailConsumer {
  /**
   * @param orm            - MikroORM instance used to create a per-message request context.
   * @param internalApi    - Resolves workspace owner email from `apps/api`.
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
   * Handles `facebook.token_expiring` — sends a token-renewal reminder email.
   *
   * @param msg     - Deserialized `FacebookTokenExpiringPayload`.
   * @param amqpMsg - Raw AMQP message; provides `x-death` headers for retry counting.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'facebook.token_expiring',
    queue: QUEUE_NAME,
    queueOptions: { durable: true, deadLetterExchange: 'fcp.retry' },
  })
  async onTokenExpiring(
    msg: FacebookTokenExpiringPayload,
    amqpMsg: ConsumeMessage,
  ): Promise<void | Nack> {
    const deathCount = getDeathCount(amqpMsg, QUEUE_NAME);
    const dedupKey = `dedup:email:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log(
        { eventId: msg.eventId },
        'FacebookTokenExpiringEmailConsumer: duplicate, skipping',
      );
      return;
    }

    let logId: string | undefined;

    try {
      const { ownerEmail } = await this.internalApi.getWorkspaceOwnerEmail(msg.workspaceId);
      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: msg.workspaceId,
          emailType: 'token_expiring',
          recipientEmail: ownerEmail,
          templateName: 'token-expiring',
          provider: 'Resend',
          dedupeKey: `${msg.eventId}:${ownerEmail}`,
          relatedEntityType: 'facebook_account',
          relatedEntityId: msg.accountId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: ownerEmail,
          templateName: 'token-expiring',
          data: { pageId: msg.pageId, tokenExpiresAt: msg.tokenExpiresAt, accountId: msg.accountId },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });
      this.logger.log({ eventId: msg.eventId }, 'FacebookTokenExpiringEmailConsumer: sent');
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
          'FacebookTokenExpiringEmailConsumer: routing to DLQ',
        );
        return; // Ack
      }

      await this.redis.del(dedupKey);
      this.logger.warn(
        { eventId: msg.eventId, attempt: deathCount + 1 },
        'FacebookTokenExpiringEmailConsumer: transient failure, scheduling retry',
      );
      return new Nack(false);
    }
  }
}
