import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DomainEvent, IEventBus } from './event-bus.port';
import { IMessagingLogRepository } from './messaging-log.port';

/** Exchange name for all FCP domain events. */
export const FCP_EVENTS_EXCHANGE = 'fcp.events';

/**
 * RabbitMQ adapter for the `IEventBus` port.
 *
 * Publishes every domain event to the `fcp.events` topic exchange using the
 * event's own `routingKey`. Wraps each publish in a best-effort observability log:
 * 1. Writes a `pending` row to `messaging.event_message_logs` before sending.
 * 2. Marks it `processed` after a successful `amqp.publish`.
 * 3. Marks it `failed` if `amqp.publish` throws (error is re-thrown so the caller retries).
 *
 * Caller contract (§6): `publish` must only be called **after** `em.flush()` —
 * the service layer is responsible for this ordering.
 */
@Injectable()
export class RabbitMqEventBus extends IEventBus {
  constructor(
    private readonly amqp: AmqpConnection,
    private readonly messagingLog: IMessagingLogRepository,
  ) {
    super();
  }

  /**
   * Publishes `event` to the `fcp.events` topic exchange.
   *
   * Logs the attempt as `pending` in `messaging.event_message_logs` before sending
   * and updates the status to `processed` or `failed` based on the outcome.
   *
   * @param event - Domain event to publish; its `routingKey` determines the binding.
   */
  async publish(event: DomainEvent): Promise<void> {
    const payload = {
      ...event,
      occurredAt: event.occurredAt.toISOString(), // coerce Date → ISO string for wire format
    } as Record<string, unknown>;

    await this.messagingLog.insertPending(
      event.eventId,
      event.routingKey,
      FCP_EVENTS_EXCHANGE,
      event.routingKey,
      payload,
    );

    try {
      await this.amqp.publish(FCP_EVENTS_EXCHANGE, event.routingKey, payload);
      await this.messagingLog.markProcessed(event.eventId);
    } catch (err) {
      await this.messagingLog.markFailed(event.eventId);
      throw err;
    }
  }
}
