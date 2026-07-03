/**
 * Marker base class for all domain events.
 *
 * Every event must carry the workspace it originated from (for routing and audit)
 * and a unique `eventId` for idempotent consumer deduplication (§11).
 */
export abstract class DomainEvent {
  /** UUID v7 of the event; used as the consumer dedup key (`dedup:<eventId>`). */
  abstract readonly eventId: string;
  /** AMQP topic routing key used by `RabbitMqEventBus` to route this event (e.g. `posts.created`). */
  abstract readonly routingKey: string;
  /** UTC timestamp when the event was raised. */
  readonly occurredAt: Date = new Date();
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
