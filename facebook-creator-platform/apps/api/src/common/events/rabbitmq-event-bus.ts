import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { FCP_EVENTS_EXCHANGE } from '@fcp/constants';
import { TraceContextService } from '../trace/trace.context';
import { DomainEvent, IEventBus } from './event-bus.port';
import { IMessagingLogRepository } from './messaging-log.port';

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
    private readonly traceCtx: TraceContextService,
  ) {
    super();
  }

  /**
   * Publishes `event` to the `fcp.events` topic exchange.
   *
   * Sets `event.traceId` from the active ALS `requestId` before serializing so that
   * consumers can correlate the event back to the originating HTTP request (ADR-100).
   * Falls back to the event's own UUID v7 when no HTTP context is active (cron jobs).
   *
   * Logs the attempt as `pending` in `messaging.event_message_logs` before sending
   * and updates the status to `processed` or `failed` based on the outcome.
   *
   * @param event - Domain event to publish; its `routingKey` determines the binding.
   */
  async publish(event: DomainEvent): Promise<void> {
    event.traceId = this.traceCtx.getRequestId() ?? event.traceId;

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
