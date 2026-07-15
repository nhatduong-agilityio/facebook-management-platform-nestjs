import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { RmqContext } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
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

/**
 * Idempotent consumer for `workspace.member-invited`.
 *
 * Sends an `invitation` email to the invited address.
 * The magic-link token is fetched from `GET /internal/invitations/:id`
 * rather than being carried in the event (ADR-050 — keep credentials off
 * the event bus).  Permanent failures are nacked without requeue so the
 * configured DLX routes them to `fcp.dlq`; transient failures are requeued
 * for immediate retry.
 */
@Controller()
export class MemberInvitedEmailConsumer {
  /**
   * @param orm           - MikroORM instance used to create a per-message request context.
   * @param internalApi   - Resolves the invitation token via `GET /internal/invitations/:id`.
   * @param emailProvider - Delivers the email via the configured provider.
   * @param emailLogRepo  - Persists `EmailDeliveryLog` rows.
   * @param redis         - Redis client for idempotent dedup (`dedup:email:{eventId}`).
   * @param logger        - Pino logger.
   * @param config        - ConfigService; reads `API_URL` to build the magic-link `acceptUrl`.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly internalApi: IInternalApiClient,
    private readonly emailProvider: IEmailProvider,
    private readonly emailLogRepo: IEmailDeliveryLogRepository,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly config: ConfigService,
  ) {}

  /**
   * Handles `workspace.member-invited` — sends an invitation email.
   *
   * @param data - Deserialized `MemberInvitedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('workspace.member-invited')
  async onMemberInvited(
    @Payload() data: MemberInvitedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:email:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'MemberInvitedEmailConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    let logId: string | undefined;

    try {
      const { token } = await this.internalApi.getInvitationEmailContext(data.invitationId);
      const apiUrl = this.config.get<string>('API_URL', 'http://localhost:3000');
      const acceptUrl = `${apiUrl}/api/v1/workspaces/${data.workspaceId}/invitations/${token}/accept`;

      await RequestContext.create(this.orm.em, async () => {
        const log = await this.emailLogRepo.create({
          workspaceId: data.workspaceId,
          emailType: 'invitation',
          recipientEmail: data.email,
          templateName: 'member-invitation',
          provider: 'Resend',
          dedupeKey: `${data.eventId}:${data.email}`,
          relatedEntityType: 'workspace',
          relatedEntityId: data.workspaceId,
        });
        logId = log.id;
        await this.emailProvider.send({
          to: data.email,
          templateName: 'member-invitation',
          data: { workspaceId: data.workspaceId, role: data.role, acceptUrl },
        });
        await this.emailLogRepo.updateSent(log.id, new Date());
      });

      this.logger.log({ eventId: data.eventId }, 'MemberInvitedEmailConsumer: sent');
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
          'MemberInvitedEmailConsumer: routing to DLQ',
        );
        channel.nack(msg, false, false);
      } else {
        await this.redis.del(dedupKey);
        this.logger.warn(
          { eventId: data.eventId },
          'MemberInvitedEmailConsumer: transient failure, scheduling retry',
        );
        channel.nack(msg, false, true);
      }
    }
  }
}
