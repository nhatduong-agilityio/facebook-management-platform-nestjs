import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
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
 * A single wildcard subscription (`routingKey: '#'`) binds the durable queue
 * `audit.all` to all routing keys on the exchange (ADR-064). One document is
 * written per unique `eventId`; duplicates are silently discarded by the
 * MongoDB unique index on `eventId` (not Redis).
 */
@Injectable()
export class AuditConsumer {
  constructor(
    private readonly repo: IAuditEventRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles every event on `fcp.events`.
   *
   * @param msg          - Raw event payload from RabbitMQ.
   * @param amqpMsg      - Raw AMQP message (used to read the actual routing key).
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: '#',
    queue: 'audit.all',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onEvent(msg: FcpEventPayload, amqpMsg: { fields: { routingKey: string } }): Promise<void | Nack> {
    if (!msg.eventId) {
      this.logger.warn({ msg }, 'AuditConsumer: missing eventId — discarding (Nack permanent)');
      return new Nack(false);
    }

    const routingKey = amqpMsg?.fields?.routingKey ?? msg.routingKey ?? 'unknown';
    const workspaceId = typeof msg.workspaceId === 'string' ? msg.workspaceId : null;
    const payload = stripPii(msg);

    try {
      await this.repo.insert({ eventId: msg.eventId, routingKey, workspaceId, payload });
      this.logger.log(
        { eventId: msg.eventId, routingKey },
        'AuditConsumer: event recorded',
      );
    } catch (err) {
      this.logger.error({ eventId: msg.eventId, routingKey, err }, 'AuditConsumer: insert failed');
      throw err;
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
