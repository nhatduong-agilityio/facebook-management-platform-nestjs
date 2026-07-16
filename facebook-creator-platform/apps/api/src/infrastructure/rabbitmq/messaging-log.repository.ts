import { Injectable } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { IMessagingLogRepository, PendingLogRow } from '../../common/events/messaging-log.port';

/**
 * Postgres adapter for `IMessagingLogRepository`.
 *
 * Writes directly to `messaging.event_message_logs` and `messaging.dead_letter_messages`
 * via raw SQL (`getConnection().execute`) — no MikroORM entity, no identity map, no flush.
 * This keeps infra logging out of the ORM Unit of Work so it never blocks or is rolled
 * back as part of a domain transaction.
 *
 * `MikroORM` is injected (not `EntityManager`) because this repository is used by the
 * event bus and DLQ consumer, both of which run outside HTTP request scope (ADR-030).
 */
@Injectable()
export class PostgresMessagingLogRepository extends IMessagingLogRepository {
  constructor(private readonly orm: MikroORM) {
    super();
  }

  /** @inheritdoc */
  async insertPending(
    eventId: string,
    eventType: string,
    exchange: string,
    routingKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.orm.em.getConnection().execute(
      `INSERT INTO messaging.event_message_logs
         (event_id, event_type, exchange_name, routing_key, processing_status, payload)
       VALUES (?, ?, ?, ?, 'pending', ?)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, eventType, exchange, routingKey, JSON.stringify(payload)],
    );
  }

  /** @inheritdoc */
  async markProcessed(eventId: string): Promise<void> {
    await this.orm.em.getConnection().execute(
      `UPDATE messaging.event_message_logs
         SET processing_status = 'processed', processed_at = now()
       WHERE event_id = ?`,
      [eventId],
    );
  }

  /** @inheritdoc */
  async markFailed(eventId: string): Promise<void> {
    await this.orm.em.getConnection().execute(
      `UPDATE messaging.event_message_logs
         SET processing_status = 'failed'
       WHERE event_id = ?`,
      [eventId],
    );
  }

  /** @inheritdoc */
  async markDlq(eventId: string): Promise<void> {
    await this.orm.em.getConnection().execute(
      `UPDATE messaging.event_message_logs
         SET processing_status = 'dlq'
       WHERE event_id = ?`,
      [eventId],
    );
  }

  /** @inheritdoc */
  async insertDeadLetter(
    eventId: string,
    errorMessage: string,
    retryCount: number,
  ): Promise<void> {
    await this.orm.em.getConnection().execute(
      `INSERT INTO messaging.dead_letter_messages
         (event_id, error_message, retry_count)
       VALUES (?, ?, ?)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, errorMessage, retryCount],
    );
  }

  /** @inheritdoc */
  async findPendingForRelay(olderThanSeconds: number): Promise<PendingLogRow[]> {
    const rows = await this.orm.em.getConnection().execute<PendingLogRow[]>(
      `SELECT event_id, routing_key, payload, retry_count
         FROM messaging.event_message_logs
        WHERE processing_status IN ('pending', 'failed')
          AND created_at < now() - (? * interval '1 second')
        ORDER BY created_at ASC`,
      [olderThanSeconds],
    );
    return rows;
  }

  /** @inheritdoc */
  async incrementRetry(eventId: string): Promise<void> {
    await this.orm.em.getConnection().execute(
      `UPDATE messaging.event_message_logs
          SET retry_count = retry_count + 1,
              last_retry_at = now()
        WHERE event_id = ?`,
      [eventId],
    );
  }
}
