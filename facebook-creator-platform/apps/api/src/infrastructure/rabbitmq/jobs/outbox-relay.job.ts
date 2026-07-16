import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { Logger } from 'nestjs-pino';
import { IMessagingLogRepository } from '../../../common/events/messaging-log.port';
import { FCP_EVENT_BUS } from '../../../common/events/rabbitmq-event-bus';

/** Minimum age (seconds) a row must have before the relay job retries it. */
const RELAY_AGE_THRESHOLD_SECONDS = 60;

/**
 * Cron job that recovers stuck outbox rows in `messaging.event_message_logs`.
 *
 * `RabbitMqEventBus.publish()` writes a `pending` row before calling `client.emit`.
 * If the process crashes between `em.flush()` and the emit, that row remains `pending`
 * forever. `failed` rows (broker error during emit) also have no recovery path without
 * this job.
 *
 * Every 30 seconds this job:
 * 1. Queries rows with `processing_status IN ('pending', 'failed')` older than 60 s.
 * 2. Re-emits each event payload to the `fcp.events` exchange via `ClientProxy`.
 * 3. Marks the row `processed` on success, or increments `retry_count` and sets
 *    `last_retry_at` on failure — then continues to the next row (per-row isolation).
 *
 * The 60 s age guard prevents racing an in-flight publisher whose `markProcessed` call
 * has not yet returned. Raw SQL only — no ORM UoW (infra table, not a domain entity).
 */
@Injectable()
export class OutboxRelayJob {
  constructor(
    private readonly messagingLog: IMessagingLogRepository,
    @Inject(FCP_EVENT_BUS) private readonly client: ClientProxy,
    private readonly logger: Logger,
  ) {}

  /**
   * Entry point called by `@nestjs/schedule` every 30 seconds.
   *
   * Processes each eligible row independently so a single broker error
   * does not abort the relay of subsequent rows.
   */
  @Cron('*/30 * * * * *')
  async run(): Promise<void> {
    const rows = await this.messagingLog.findPendingForRelay(RELAY_AGE_THRESHOLD_SECONDS);

    if (rows.length === 0) return;

    this.logger.log({ count: rows.length }, 'OutboxRelayJob: relaying stuck events');

    for (const row of rows) {
      await this.relayRow(row.event_id, row.routing_key, row.payload, row.retry_count);
    }
  }

  /**
   * Attempts to re-emit a single outbox row and updates its status.
   *
   * @param eventId    - UUID v7 of the event (matches `event_message_logs.event_id`).
   * @param routingKey - AMQP routing key used for the original emit.
   * @param payload    - Stored event payload to re-emit verbatim.
   * @param retryCount - Current retry count (logged for observability).
   */
  private async relayRow(
    eventId: string,
    routingKey: string,
    payload: Record<string, unknown>,
    retryCount: number,
  ): Promise<void> {
    try {
      await lastValueFrom(this.client.emit(routingKey, payload), { defaultValue: undefined });
      await this.messagingLog.markProcessed(eventId);
      this.logger.log({ eventId, routingKey }, 'OutboxRelayJob: event relayed successfully');
    } catch (err) {
      await this.messagingLog.incrementRetry(eventId);
      this.logger.error(
        { eventId, routingKey, retryCount: retryCount + 1, err },
        'OutboxRelayJob: relay attempt failed; will retry next tick',
      );
    }
  }
}
