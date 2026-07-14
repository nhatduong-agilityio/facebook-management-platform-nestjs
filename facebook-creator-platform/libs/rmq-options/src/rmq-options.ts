import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

/**
 * Returns `MicroserviceOptions` for a topic-exchange consumer bound to `fcp.events`.
 *
 * Use this in every service that consumes domain events:
 * - `wildcards: true` enables `*` / `#` routing-key patterns (Topic Exchange).
 * - `noAck: false` requires the handler to call `channel.ack()` or `channel.nack()`.
 * - `x-dead-letter-exchange: fcp.dlq` routes permanently-nacked messages to the DLQ.
 * - `prefetchCount` is read from the `RMQ_PREFETCH` env var (default 10).
 *
 * @param queue - Name of the durable queue to bind and consume from.
 * @param configService - NestJS ConfigService for reading `RABBITMQ_URL` and `RMQ_PREFETCH`.
 */
export function getRmqOptions(
  queue: string,
  configService: ConfigService,
): MicroserviceOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
      queue,
      noAck: false,
      prefetchCount: configService.get<number>('RMQ_PREFETCH', 10),
      wildcards: true,
      exchange: 'fcp.events',
      exchangeType: 'topic',
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'fcp.dlq',
        },
      },
    },
  };
}

/**
 * Returns `MicroserviceOptions` for a DLQ fanout-exchange consumer bound to `fcp.dlq`.
 *
 * Use this for the dead-letter logger queue only:
 * - `wildcards: false` — fanout exchange delivers to all bound queues regardless of key.
 * - `noAck: false` requires explicit ack/nack.
 * - No `x-dead-letter-exchange` to avoid re-routing loops.
 * - `prefetchCount` is read from the `RMQ_DLQ_PREFETCH` env var (default 5).
 *
 * @param queue - Name of the durable DLQ queue (e.g. `'dlq.logger'`).
 * @param configService - NestJS ConfigService for reading `RABBITMQ_URL` and `RMQ_DLQ_PREFETCH`.
 */
export function getDlqRmqOptions(
  queue: string,
  configService: ConfigService,
): MicroserviceOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
      queue,
      noAck: false,
      prefetchCount: configService.get<number>('RMQ_DLQ_PREFETCH', 5),
      wildcards: false,
      exchange: 'fcp.dlq',
      exchangeType: 'fanout',
      queueOptions: {
        durable: true,
      },
    },
  };
}
