import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DomainEvent, IEventBus } from './event-bus.port';

/** Exchange name for all FCP domain events. */
export const FCP_EVENTS_EXCHANGE = 'fcp.events';

/**
 * RabbitMQ adapter for the `IEventBus` port.
 *
 * Publishes every domain event to the `fcp.events` topic exchange using the
 * event's own `routingKey`. The `AmqpConnection` is provided by `RabbitmqModule`
 * (global) so this adapter need not manage the connection lifecycle.
 *
 * Caller contract (§6): `publish` must only be called **after** `em.flush()` —
 * the service layer is responsible for this ordering.
 */
@Injectable()
export class RabbitMqEventBus extends IEventBus {
  constructor(private readonly amqp: AmqpConnection) {
    super();
  }

  /**
   * Publishes `event` to the `fcp.events` topic exchange.
   *
   * @param event - Domain event to publish; its `routingKey` determines the binding.
   */
  async publish(event: DomainEvent): Promise<void> {
    await this.amqp.publish(FCP_EVENTS_EXCHANGE, event.routingKey, {
      ...event,
      occurredAt: event.occurredAt.toISOString(), // coerce Date → ISO string for wire format
    });
  }
}
