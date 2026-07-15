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

/**
 * Idempotent consumer for `facebook.token_expiring`.
 *
 * Sends a `token_expiring` reminder email to the workspace owner.
 * Recipient email resolved via `GET /internal/workspaces/:id` on `apps/api` (ADR-050, ADR-053).
 * Permanent failures are nacked without requeue (DLX → `fcp.dlq`); transient
 * failures are requeued for immediate retry.
 */
@Controller()
export class FacebookTokenExpiringEmailConsumer {
  /**
   * @param orm           - MikroORM instance used to create a per-message request context.
   * @param internalApi   - Resolves workspace owner email from `apps/api`.
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
   * Handles `facebook.token_expiring` — sends a token-renewal reminder email.
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

    const dedupKey = `dedup:email:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log(
        { eventId: data.eventId },
        'FacebookTokenExpiringEmailConsumer: duplicate, skipping',
      );
      channel.ack(msg);
      return;
    }

    let logId: string | undefined;

    try {
      const { ownerEmail } = await this.internalApi.getWorkspaceOwnerEmail(data.workspaceId);

      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: data.workspaceId,
          emailType: 'token_expiring',
          recipientEmail: ownerEmail,
          templateName: 'token-expiring',
          provider: 'Resend',
          dedupeKey: `${data.eventId}:${ownerEmail}`,
          relatedEntityType: 'facebook_account',
          relatedEntityId: data.accountId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: ownerEmail,
          templateName: 'token-expiring',
          data: {
            pageId: data.pageId,
            tokenExpiresAt: data.tokenExpiresAt,
            accountId: data.accountId,
          },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });

      this.logger.log({ eventId: data.eventId }, 'FacebookTokenExpiringEmailConsumer: sent');
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
          'FacebookTokenExpiringEmailConsumer: routing to DLQ',
        );
        channel.nack(msg, false, false);
      } else {
        await this.redis.del(dedupKey);
        this.logger.warn(
          { eventId: data.eventId },
          'FacebookTokenExpiringEmailConsumer: transient failure, scheduling retry',
        );
        channel.nack(msg, false, true);
      }
    }
  }
}
