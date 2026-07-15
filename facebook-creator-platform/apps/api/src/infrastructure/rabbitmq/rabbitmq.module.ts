import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT, FCP_EVENTS_EXCHANGE } from '@fcp/constants';
import { IEventBus } from '../../common/events/event-bus.port';
import { IMessagingLogRepository } from '../../common/events/messaging-log.port';
import { FCP_EVENT_BUS, RabbitMqEventBus } from '../../common/events/rabbitmq-event-bus';
import { PostgresMessagingLogRepository } from './messaging-log.repository';
import { DlqConsumer } from './consumers/dlq.consumer';

/**
 * Global infrastructure module that wires the RabbitMQ publisher, ioredis client,
 * and the messaging observability log (T2.6.5).
 *
 * Exports:
 * - `IEventBus` → `RabbitMqEventBus` (logs pending/processed/failed to `messaging.event_message_logs`)
 * - `IMessagingLogRepository` → `PostgresMessagingLogRepository`
 * - `IOREDIS_CLIENT` → shared `ioredis` instance for consumer dedup
 *
 * The `fcp.events` topic exchange is asserted by the `ClientProxy` on connection.
 * Consumer microservice transports (added in TR.3) assert it again — idempotent.
 *
 * `DlqConsumer` is registered as a controller so NestJS microservices register its
 * `@EventPattern('#')` handler in the DLQ transport (TR.3).
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: FCP_EVENT_BUS,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: '',
            noAssert: true,
            exchange: FCP_EVENTS_EXCHANGE,
            exchangeType: 'topic',
          },
        }),
      },
    ]),
  ],
  controllers: [DlqConsumer],
  providers: [
    {
      provide: IOREDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
    },
    {
      provide: IMessagingLogRepository,
      useClass: PostgresMessagingLogRepository,
    },
    {
      provide: IEventBus,
      useClass: RabbitMqEventBus,
    },
  ],
  exports: [IEventBus, IMessagingLogRepository, IOREDIS_CLIENT],
})
export class RabbitmqModule {}
