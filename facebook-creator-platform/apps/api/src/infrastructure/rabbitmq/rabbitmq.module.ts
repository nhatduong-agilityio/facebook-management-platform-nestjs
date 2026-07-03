import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Redis } from 'ioredis';
import { IEventBus } from '../../common/events/event-bus.port';
import { RabbitMqEventBus } from '../../common/events/rabbitmq-event-bus';

/**
 * Injection token for the shared `ioredis` client used by consumer dedup checks (§11).
 *
 * Inject with `@Inject(IOREDIS_CLIENT) private readonly redis: Redis`.
 */
export const IOREDIS_CLIENT = Symbol('IOREDIS_CLIENT');

/**
 * Global infrastructure module that wires the RabbitMQ connection and the ioredis client.
 *
 * Exports:
 * - `IEventBus` → `RabbitMqEventBus` (replaces `NoopEventBus` from T1.5)
 * - `IOREDIS_CLIENT` → shared `ioredis` instance for consumer dedup
 * - `RabbitMQModule` → exposes `AmqpConnection` to all feature modules
 *
 * Exchanges declared here:
 * - `fcp.events` — topic exchange (durable); all domain events route through it
 * - `fcp.dlq`   — fanout exchange (durable); receives unprocessable messages via DLX
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        exchanges: [
          { name: 'fcp.events', type: 'topic', options: { durable: true } },
          { name: 'fcp.dlq', type: 'fanout', options: { durable: true } },
        ],
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  providers: [
    {
      provide: IOREDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
    },
    {
      provide: IEventBus,
      useClass: RabbitMqEventBus,
    },
  ],
  exports: [IEventBus, IOREDIS_CLIENT, RabbitMQModule],
})
export class RabbitmqModule {}
