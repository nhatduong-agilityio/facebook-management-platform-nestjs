/**
 * Shared injection token for the `ioredis` Redis client used across all services and `apps/api`.
 *
 * Every package that consumes RabbitMQ events uses this token to inject the dedup Redis client.
 * Inject with `@Inject(IOREDIS_CLIENT) private readonly redis: Redis`.
 */
export const IOREDIS_CLIENT = Symbol('IOREDIS_CLIENT');

/** AMQP exchange name for all FCP domain events (topic exchange). */
export const FCP_EVENTS_EXCHANGE = 'fcp.events';

/** AMQP exchange name for the FCP dead-letter queue (fanout exchange). */
export const FCP_DLQ_EXCHANGE = 'fcp.dlq';
