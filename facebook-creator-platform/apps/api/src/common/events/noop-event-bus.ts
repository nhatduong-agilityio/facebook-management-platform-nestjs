import { Injectable } from '@nestjs/common';
import { DomainEvent, IEventBus } from './event-bus.port';

/**
 * No-op event bus adapter used until T2.6 wires the real RabbitMQ publisher.
 *
 * Discards all events immediately. Swap for `RabbitMqEventBus` in T2.6 by
 * changing the provider binding in each feature module — service code is unchanged.
 */
@Injectable()
export class NoopEventBus extends IEventBus {
  /** Silently discards the event. Replaced in T2.6 with the real publisher. */
  async publish(_event: DomainEvent): Promise<void> {
    // intentional no-op
  }
}
