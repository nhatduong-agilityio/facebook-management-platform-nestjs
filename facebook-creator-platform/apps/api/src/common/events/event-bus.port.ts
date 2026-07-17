import { uuidv7 } from 'uuidv7';

/**
 * Marker base class for all domain events.
 *
 * Every event must carry the workspace it originated from (for routing and audit)
 * and a unique `eventId` for idempotent consumer deduplication (§11).
 *
 * `traceId` correlates this event back to the HTTP request that triggered it (M-9).
 * It is set to a fresh UUID v7 by default (cron / test contexts) and overwritten
 * by `RabbitMqEventBus.publish` with the active ALS `requestId` when one exists.
 */
export abstract class DomainEvent {
  /** UUID v7 of the event; used as the consumer dedup key (`dedup:<eventId>`). */
  abstract readonly eventId: string;
  /** AMQP topic routing key used by `RabbitMqEventBus` to route this event (e.g. `posts.created`). */
  abstract readonly routingKey: string;
  /** UTC timestamp when the event was raised. */
  readonly occurredAt: Date = new Date();
  /**
   * UUID v7 correlation ID linking this event to the originating HTTP request (M-9, ADR-100).
   * Overwritten by `RabbitMqEventBus.publish` with the ALS `requestId` when an HTTP
   * context is active; remains a fresh UUID v7 for cron-emitted events with no HTTP context.
   */
  traceId: string = uuidv7();
}

/**
 * Port (outbound): contract for publishing domain events after a transaction commits.
 *
 * Bound to a no-op adapter until T2.6 wires the real RabbitMQ publisher.
 * Services call `publish` after `flush()` — never before (§6).
 */
export abstract class IEventBus {
  /**
   * Publishes a domain event to the event bus.
   *
   * @param event - The domain event to publish.
   */
  abstract publish(event: DomainEvent): Promise<void>;
}
