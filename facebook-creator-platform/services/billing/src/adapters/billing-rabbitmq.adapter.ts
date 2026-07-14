import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { IBillingEventBus } from '../ports/billing-event-bus.port';

/**
 * Injection token for the `ClientProxy` that publishes to `fcp.events`.
 *
 * Registered in `AppModule` via `ClientsModule.registerAsync`.
 * Inject with `@Inject(BILLING_EVENT_BUS) private readonly client: ClientProxy`.
 */
export const BILLING_EVENT_BUS = 'BILLING_EVENT_BUS';

/**
 * Publishes billing domain events to the `fcp.events` RabbitMQ topic exchange.
 *
 * Only publishes — `services/billing` does not consume from `fcp.events`.
 * Events must be published **after** `em.flush()` commits (CODING-STANDARDS.md §6).
 *
 * Uses `ClientProxy.emit()` (fire-and-forget) wrapped in `lastValueFrom` so that
 * broker-level errors are propagated as thrown exceptions rather than swallowed.
 */
@Injectable()
export class BillingRabbitMqAdapter extends IBillingEventBus {
  constructor(@Inject(BILLING_EVENT_BUS) private readonly client: ClientProxy) {
    super();
  }

  /**
   * Publishes a message to the `fcp.events` topic exchange.
   *
   * @param routingKey - Routing key (e.g. `billing.subscription_activated`).
   * @param payload    - Serialisable event payload. Must not contain PII.
   */
  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    await lastValueFrom(this.client.emit(routingKey, payload), { defaultValue: undefined });
  }
}
