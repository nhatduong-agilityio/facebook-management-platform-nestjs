/**
 * A row returned by `IMessagingLogRepository.findPendingForRelay`.
 * Contains the minimum fields needed by the outbox relay job to re-emit an event.
 */
export interface PendingLogRow {
  /** UUID v7 of the domain event — used to mark processed or increment retry. */
  event_id: string;
  /** AMQP routing key the event was originally published with. */
  routing_key: string;
  /** Full serialised event payload stored when the row was first inserted. */
  payload: Record<string, unknown>;
  /** Number of relay attempts made so far. */
  retry_count: number;
}

/**
 * Port: persistence contract for the messaging infrastructure observability log.
 *
 * The event bus publisher calls this before and after every `amqp.publish` call so
 * operators can query `messaging.event_message_logs` to detect stuck or failed events.
 * The DLQ consumer calls this to record permanently-failed messages in
 * `messaging.dead_letter_messages`.
 *
 * This is an infra-only port — it does not model a domain concept. Implementations
 * write raw SQL directly; no MikroORM entity / flush lifecycle is involved.
 */
export abstract class IMessagingLogRepository {
  /**
   * Inserts a `pending` row into `messaging.event_message_logs`.
   * Must be called before `amqp.publish` so the row exists if the process crashes
   * after delivery but before the `processed` update.
   *
   * @param eventId     - UUID v7 of the domain event (PK of event_message_logs).
   * @param eventType   - Routing key used as a human-readable event type label.
   * @param exchange    - AMQP exchange name (e.g. `fcp.events`).
   * @param routingKey  - AMQP routing key for this event.
   * @param payload     - Full serialised event payload stored for debugging.
   */
  abstract insertPending(
    eventId: string,
    eventType: string,
    exchange: string,
    routingKey: string,
    payload: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Updates `processing_status` to `'processed'` and sets `processed_at = now()`.
   * Called after `amqp.publish` returns successfully.
   *
   * @param eventId - UUID v7 of the domain event.
   */
  abstract markProcessed(eventId: string): Promise<void>;

  /**
   * Updates `processing_status` to `'failed'`.
   * Called when `amqp.publish` throws so operators can see which events were never delivered.
   *
   * @param eventId - UUID v7 of the domain event.
   */
  abstract markFailed(eventId: string): Promise<void>;

  /**
   * Updates `processing_status` to `'dlq'`.
   * Called by the DLQ consumer when a message is permanently nacked.
   *
   * @param eventId - UUID v7 of the domain event.
   */
  abstract markDlq(eventId: string): Promise<void>;

  /**
   * Inserts a row into `messaging.dead_letter_messages`.
   * The `event_id` FK must already exist in `event_message_logs` (written by the publisher).
   *
   * @param eventId      - UUID v7 matching the `event_message_logs.event_id`.
   * @param errorMessage - Human-readable reason the message was dead-lettered.
   * @param retryCount   - Number of delivery attempts before the message was rejected.
   */
  abstract insertDeadLetter(
    eventId: string,
    errorMessage: string,
    retryCount: number,
  ): Promise<void>;

  /**
   * Returns rows eligible for outbox relay: those whose `processing_status` is
   * `'pending'` or `'failed'` and whose `created_at` is older than `olderThanSeconds`.
   *
   * The age guard prevents the relay job from racing the in-flight publisher: a row
   * created in the last 60 seconds may still have its `markProcessed` call in flight.
   *
   * @param olderThanSeconds - Minimum age in seconds a row must be before it is retried.
   */
  abstract findPendingForRelay(olderThanSeconds: number): Promise<PendingLogRow[]>;

  /**
   * Increments `retry_count` by 1 and sets `last_retry_at = now()` for the given row.
   * Called by the outbox relay job when a re-emit attempt fails.
   *
   * @param eventId - UUID v7 of the event whose retry count should be incremented.
   */
  abstract incrementRetry(eventId: string): Promise<void>;
}
