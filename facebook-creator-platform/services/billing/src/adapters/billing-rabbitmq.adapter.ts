import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { IBillingEventBus } from '../ports/billing-event-bus.port';

/**
 * Publishes billing domain events to the `fcp.events` RabbitMQ topic exchange.
 *
 * Only publishes — `services/billing` does not consume from `fcp.events`.
 * Events must be published **after** `em.flush()` commits (CODING-STANDARDS.md §6).
 */
@Injectable()
export class BillingRabbitMqAdapter extends IBillingEventBus {
  constructor(private readonly amqp: AmqpConnection) {
    super();
  }

  /**
   * Publishes a message to the `fcp.events` topic exchange.
   *
   * @param routingKey - Routing key (e.g. `billing.subscription_activated`).
   * @param payload    - Serialisable event payload. Must not contain PII.
   */
  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    await this.amqp.publish('fcp.events', routingKey, payload);
  }
}
