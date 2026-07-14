import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import type { Channel, Message } from 'amqplib';
import { IAuditEventRepository } from './ports/audit-event.repository.port';

/**
 * Minimum shape expected from every event on `fcp.events`.
 * All `DomainEvent` subclasses carry at least these fields.
 */
interface FcpEventPayload {
  eventId: string;
  routingKey?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

/**
 * Known PII field names that must be stripped before persisting an audit doc.
 *
 * `MemberInvitedEvent` carries `email` for the Email Service; the audit consumer
 * removes it as a defence-in-depth measure (§11 rule 4, ADR-064).
 */
const PII_FIELDS: ReadonlySet<string> = new Set([
  'email',
  'fullName',
  'accessToken',
  'pageToken',
  'password',
]);

/**
 * Consumes every event published to the `fcp.events` topic exchange.
 *
 * A single wildcard subscription (`@EventPattern('#')`) binds the durable queue
 * `audit.all` to all routing keys on the exchange (ADR-064, TR.6). One document
 * is written per unique `eventId`; duplicates are silently discarded by the
 * MongoDB unique index on `eventId` (not Redis).
 *
 * `RequestContext.create` wraps each message so MikroORM gets an isolated
 * `EntityManager` per message (HTTP middleware does not run for microservice handlers).
 */
@Controller()
export class AuditConsumer {
  /**
   * @param orm    - MikroORM instance used to create a per-message request context.
   * @param repo   - Persists `AuditEvent` documents to MongoDB.
   * @param logger - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly repo: IAuditEventRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles every event on `fcp.events` (wildcard `#`).
   *
   * @param data - Deserialized event payload (unwrapped from the NestJS `{ pattern, data }` envelope).
   * @param ctx  - RMQ context providing the channel and raw AMQP message for ack/nack.
   */
  @EventPattern('#')
  async onEvent(
    @Payload() data: FcpEventPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    if (!data.eventId) {
      this.logger.warn({ msg: data }, 'AuditConsumer: missing eventId — permanent discard');
      channel.nack(msg, false, false);
      return;
    }

    const routingKey = msg.fields.routingKey ?? data.routingKey ?? 'unknown';
    const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId : null;
    const payload = stripPii(data);

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.repo.insert({ eventId: data.eventId, routingKey, workspaceId, payload });
      });
      this.logger.log({ eventId: data.eventId, routingKey }, 'AuditConsumer: event recorded');
      channel.ack(msg);
    } catch (err) {
      this.logger.error({ eventId: data.eventId, routingKey, err }, 'AuditConsumer: insert failed');
      channel.nack(msg, false, true);
    }
  }
}

/**
 * Returns a shallow copy of the payload with PII fields removed.
 * Does not mutate the original object.
 */
function stripPii(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!PII_FIELDS.has(key)) clean[key] = value;
  }
  return clean;
}
