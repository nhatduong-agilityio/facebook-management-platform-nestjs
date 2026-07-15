import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
import type { PaymentFailedPayload } from '@fcp/billing-contracts';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';

/**
 * Idempotent consumer for `billing.payment_failed`.
 *
 * Sends a `payment_failed` email to the workspace owner.
 * Recipient email resolved via `GET /internal/workspaces/:id` on `apps/api` (ADR-050).
 * Permanent failures are nacked without requeue (DLX → `fcp.dlq`); transient
 * failures are requeued for immediate retry.
 */
@Controller()
export class BillingPaymentFailedEmailConsumer {
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
   * Handles `billing.payment_failed` — sends a payment-failure email to the workspace owner.
   *
   * @param data - Deserialized `PaymentFailedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('billing.payment_failed')
  async onPaymentFailed(
    @Payload() data: PaymentFailedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:email:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log(
        { eventId: data.eventId },
        'BillingPaymentFailedEmailConsumer: duplicate, skipping',
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
          emailType: 'payment_failed',
          recipientEmail: ownerEmail,
          templateName: 'payment-failed',
          provider: 'Resend',
          dedupeKey: `${data.eventId}:${ownerEmail}`,
          relatedEntityType: 'workspace',
          relatedEntityId: data.workspaceId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: ownerEmail,
          templateName: 'payment-failed',
          data: { workspaceId: data.workspaceId, planCode: data.planCode },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });

      this.logger.log({ eventId: data.eventId }, 'BillingPaymentFailedEmailConsumer: sent');
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
          'BillingPaymentFailedEmailConsumer: routing to DLQ',
        );
        channel.nack(msg, false, false);
      } else {
        await this.redis.del(dedupKey);
        this.logger.warn(
          { eventId: data.eventId },
          'BillingPaymentFailedEmailConsumer: transient failure, scheduling retry',
        );
        channel.nack(msg, false, true);
      }
    }
  }
}
