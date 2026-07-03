/**
 * Port (outbound): publishes billing domain events to the RabbitMQ `fcp.events` exchange.
 *
 * Implemented by `BillingRabbitMqAdapter` in production. Published only after
 * `em.flush()` has committed (CODING-STANDARDS.md §6).
 */
export abstract class IBillingEventBus {
  /**
   * Publishes a message to the `fcp.events` topic exchange.
   *
   * @param routingKey - Routing key (e.g. `billing.subscription_activated`).
   * @param payload    - Serialisable event payload. Must not contain PII.
   */
  abstract publish(routingKey: string, payload: Record<string, unknown>): Promise<void>;
}
