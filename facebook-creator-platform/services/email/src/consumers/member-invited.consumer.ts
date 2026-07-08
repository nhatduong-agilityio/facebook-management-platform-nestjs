import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * Shape of the `workspace.member-invited` event payload.
 * Mirrors `MemberInvitedEvent` in `apps/api`.
 */
export interface MemberInvitedPayload {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly invitationId: string;
  readonly email: string;
  readonly role: 'editor' | 'viewer';
  readonly invitedByUserId: string;
}

/** Name of the AMQP queue this consumer owns; used for x-death counting. */
const QUEUE_NAME = 'email.workspace.member-invited';

/**
 * Idempotent consumer for `workspace.member-invited`.
 *
 * Sends an `invitation` email to the invited address.
 * The magic-link token is fetched from `GET /internal/invitations/:id`
 * rather than being carried in the event (ADR-050 — keep credentials off
 * the event bus). Transient failures are retried up to `MAX_EMAIL_RETRIES`
 * times via `fcp.retry` (30 s TTL); permanent failures and exhausted retries
 * are published to `fcp.dlq` and the original message is acknowledged.
 */
@Injectable()
export class MemberInvitedEmailConsumer {
  /**
   * @param orm              - MikroORM instance used to create a per-message request context.
   * @param internalApi      - Resolves the invitation token via `GET /internal/invitations/:id`.
   * @param emailProvider    - Delivers the email via the configured provider.
   * @param emailLogRepo     - Persists `EmailDeliveryLog` rows.
   * @param redis            - Redis client for idempotent dedup (`dedup:email:{eventId}`).
   * @param logger           - Pino logger.
   * @param config           - ConfigService; reads `API_URL` to build the magic-link `acceptUrl`.
   * @param amqpConnection   - AMQP connection used to publish failed messages to `fcp.dlq`.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly internalApi: IInternalApiClient,
    private readonly emailProvider: IEmailProvider,
    private readonly emailLogRepo: IEmailDeliveryLogRepository,
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly config: ConfigService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  /**
   * Handles `workspace.member-invited` — sends an invitation email.
   *
   * @param msg     - Deserialized `MemberInvitedPayload`.
   * @param amqpMsg - Raw AMQP message; provides `x-death` headers for retry counting.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'workspace.member-invited',
    queue: QUEUE_NAME,
    queueOptions: { durable: true, deadLetterExchange: 'fcp.retry' },
  })
  async onMemberInvited(msg: MemberInvitedPayload, amqpMsg: ConsumeMessage): Promise<void | Nack> {
    const deathCount = getDeathCount(amqpMsg, QUEUE_NAME);
    const dedupKey = `dedup:email:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'MemberInvitedEmailConsumer: duplicate, skipping');
      return;
    }

    let logId: string | undefined;

    try {
      const { token } = await this.internalApi.getInvitationEmailContext(msg.invitationId);
      const apiUrl = this.config.get<string>('API_URL', 'http://localhost:3000');
      const acceptUrl = `${apiUrl}/api/v1/workspaces/${msg.workspaceId}/invitations/${token}/accept`;

      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: msg.workspaceId,
          emailType: 'invitation',
          recipientEmail: msg.email,
          templateName: 'member-invitation',
          provider: 'Resend',
          dedupeKey: `${msg.eventId}:${msg.email}`,
          relatedEntityType: 'workspace',
          relatedEntityId: msg.workspaceId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: msg.email,
          templateName: 'member-invitation',
          data: { workspaceId: msg.workspaceId, role: msg.role, acceptUrl },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });
      this.logger.log({ eventId: msg.eventId }, 'MemberInvitedEmailConsumer: sent');
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
          'MemberInvitedEmailConsumer: routing to DLQ',
        );
        return; // Ack — message consumed, will not be requeued
      }

      await this.redis.del(dedupKey);
      this.logger.warn(
        { eventId: msg.eventId, attempt: deathCount + 1 },
        'MemberInvitedEmailConsumer: transient failure, scheduling retry',
      );
      return new Nack(false); // → fcp.retry → 30 s TTL → redeliver
    }
  }
}
