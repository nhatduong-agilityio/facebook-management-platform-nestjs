import type { Channel, Message } from 'amqplib';
import type { Redis } from 'ioredis';

/** TTL (seconds) for the Redis dedup key — 24 hours covers any redelivery window. */
const DEDUP_TTL_SECONDS = 86400;

/**
 * Abstract base class for idempotent RabbitMQ consumers (§11).
 *
 * Provides `withDedup` which gates handler logic behind a Redis `SET NX EX` check,
 * then calls `channel.ack(msg)` or `channel.nack(msg, ...)` as appropriate.
 * Subclasses call `withDedup(eventId, channel, msg, async () => { ... business logic ... })`
 * at the top of every `@EventPattern` handler.
 */
export abstract class IdempotentConsumer {
  constructor(protected readonly redis: Redis) {}

  /**
   * Executes `fn` exactly once per `eventId` using Redis `SET NX EX` deduplication,
   * then acks or nacks `msg` via `channel`.
   *
   * - Duplicate delivery → `channel.ack(msg)` (already processed, skip silently).
   * - `fn()` resolves → `channel.ack(msg)` (success).
   * - `fn()` returns `'nack'` → `channel.nack(msg, false, false)` (permanent failure → DLX).
   * - `fn()` throws (transient error) → dedup key deleted; `channel.nack(msg, false, true)` (requeue).
   *
   * @param eventId - Unique event id used as the Redis key (`dedup:<eventId>`).
   * @param channel - AMQP channel from `RmqContext.getChannelRef()`.
   * @param msg     - AMQP message from `RmqContext.getMessage()`.
   * @param fn      - Async handler; return `'nack'` to signal a permanent, non-retryable failure.
   */
  protected async withDedup(
    eventId: string,
    channel: Channel,
    msg: Message,
    fn: () => Promise<void | 'nack'>,
  ): Promise<void> {
    const key = `dedup:${eventId}`;
    const isNew = await this.redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');

    if (!isNew) {
      channel.ack(msg);
      return;
    }

    try {
      const result = await fn();
      if (result === 'nack') {
        channel.nack(msg, false, false); // permanent failure → DLX
      } else {
        channel.ack(msg);
      }
    } catch {
      await this.redis.del(key); // allow retry on redelivery
      channel.nack(msg, false, true); // transient failure → requeue
    }
  }
}
