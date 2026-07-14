import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DomainEvent, IEventBus } from './event-bus.port';
import { IMessagingLogRepository } from './messaging-log.port';

/** Exchange name for all FCP domain events. */
export const FCP_EVENTS_EXCHANGE = 'fcp.events';

/** Injection token for the RMQ `ClientProxy` publisher. */
export const FCP_EVENT_BUS = 'FCP_EVENT_BUS';

/**
 * RabbitMQ adapter for the `IEventBus` port.
 *
 * Publishes every domain event to the `fcp.events` topic exchange using the
 * event's own `routingKey`. Wraps each publish in a best-effort observability log:
 * 1. Writes a `pending` row to `messaging.event_message_logs` before sending.
 * 2. Marks it `processed` after a successful `client.emit`.
 * 3. Marks it `failed` if `client.emit` errors (error is re-thrown so the caller retries).
 *
 * Caller contract (§6): `publish` must only be called **after** `em.flush()` —
 * the service layer is responsible for this ordering.
 */
@Injectable()
export class RabbitMqEventBus extends IEventBus {
  constructor(
    @Inject(FCP_EVENT_BUS) private readonly client: ClientProxy,
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
      await lastValueFrom(this.client.emit(event.routingKey, payload), { defaultValue: undefined });
      await this.messagingLog.markProcessed(event.eventId);
    } catch (err) {
      await this.messagingLog.markFailed(event.eventId);
      throw err;
    }
  }
}
