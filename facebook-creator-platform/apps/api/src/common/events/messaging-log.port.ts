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
}
