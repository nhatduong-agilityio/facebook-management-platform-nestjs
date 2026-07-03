import { Nack } from '@golevelup/nestjs-rabbitmq';
import type { Redis } from 'ioredis';

/** TTL (seconds) for the Redis dedup key — 24 hours covers any redelivery window. */
const DEDUP_TTL_SECONDS = 86400;

/**
 * Abstract base class for idempotent RabbitMQ consumers (§11).
 *
 * Provides `withDedup` which gates handler logic behind a Redis `SET NX EX` check.
 * Subclasses call `withDedup(msg.eventId, async () => { ... business logic ... })`
 * at the top of every `@RabbitSubscribe` handler.
 */
export abstract class IdempotentConsumer {
  constructor(protected readonly redis: Redis) {}

  /**
   * Executes `fn` exactly once per `eventId` using Redis `SET NX EX` deduplication.
   *
   * - If `eventId` was already processed the method returns `undefined` immediately.
   * - If `fn` throws (transient error), the dedup key is deleted so the next
   *   redelivery can retry, then the error is re-thrown so RabbitMQ redelivers.
   * - Permanent failures should be handled inside `fn` by returning `new Nack(false)`.
   *
   * @param eventId - Unique event id used as the Redis key (`dedup:<eventId>`).
   * @param fn      - Async handler to run if the event has not been seen before.
   * @returns `undefined` (success or duplicate) or `Nack` (permanent failure from `fn`).
   */
  protected async withDedup(
    eventId: string,
    fn: () => Promise<void | Nack>,
  ): Promise<void | Nack> {
    const key = `dedup:${eventId}`;
    const isNew = await this.redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
    if (!isNew) return; // duplicate delivery — skip

    try {
      return await fn();
    } catch (err) {
      // Transient failure: clear the dedup key so the next redelivery retries
      await this.redis.del(key);
      throw err; // RabbitMQ will redeliver
    }
  }
}
