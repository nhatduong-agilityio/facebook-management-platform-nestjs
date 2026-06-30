---
name: rabbitmq-consumer
description: Use when writing a RabbitMQ event consumer with @golevelup/nestjs-rabbitmq so it is idempotent, durable, DLQ-backed, and publishes only after commit. Trigger on "consumer", "subscribe to event", "RabbitMQ handler", "event listener", "process PostCreated", or any @RabbitSubscribe usage.
---

# Skill: RabbitMQ consumer (FCP)

## When to use
Writing any `@RabbitSubscribe` handler — audit consumer (T3.4), analytics consumer
(T3.3), search indexer (T4.1), notification handler (T4.2), email consumer (T4.3).

## Rules (must hold)
1. **Idempotent first**: check `eventId` before doing any work. Use Redis `SET NX EX`
   (preferred) or a DB unique constraint on `event_id`.
2. **DLQ-backed queue**: declare `deadLetterExchange` so unprocessable messages
   don't block the queue forever.
3. **Durable queue**: `durable: true` — survives broker restart.
4. **No side-effects before the dedup check.** The check must be the first await.
5. **Flush before publish** (CODING-STANDARDS.md §6). Consumers should never
   publish to the bus inside the same flush; use a separate step.
6. **Nack only for permanent failures** (schema mismatch, unrecoverable domain
   error). Transient errors (DB down, network blip) → throw and let RabbitMQ
   redeliver automatically.
7. **No PII in consumed events.** Publishers strip it before publishing (§4/§6).
   If a consumed event contains PII, log an error and nack permanently.

## Exchange / routing key conventions
```
exchange:      fcp.events          (topic, durable)
DLX:           fcp.dlq             (fanout, durable)
routing keys:  <domain>.<event>    e.g. posts.created, billing.subscription_activated
queue names:   <service>.<domain>  e.g. audit.posts, analytics.posts
```

## Template

```ts
// services/<name>/src/<name>.consumer.ts
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EntityManager } from '@mikro-orm/core';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class PostsConsumer {
  constructor(
    private readonly em: EntityManager,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.created',
    queue: 'audit.posts.created',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onPostCreated(msg: PostCreatedPayload): Promise<void | Nack> {
    // 1. Idempotency check — MUST be first
    const dedupKey = `dedup:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) return; // already processed

    try {
      // 2. Business logic
      const doc = this.em.create(AuditEvent, {
        id: uuidv7(),
        eventId: msg.eventId,
        eventType: 'posts.created',
        payload: msg,
        occurredAt: new Date(msg.occurredAt),
      });
      await this.em.flush(); // one transaction

      // 3. If this consumer also publishes downstream events, do it AFTER flush
      // await this.bus.publish('audit.indexed', { ... });
    } catch (err) {
      // Transient error: clear the dedup key so retry is possible, then throw
      await this.redis.del(dedupKey);
      throw err; // RabbitMQ will redeliver
    }
  }
}
```

## Dedup with DB unique constraint (alternative to Redis)
```ts
// If Redis is not available, use a dedup table instead:
// CREATE TABLE messaging.consumed_events (
//   event_id uuid PRIMARY KEY,
//   consumed_at timestamptz NOT NULL DEFAULT now()
// );
//
// In the consumer: INSERT ... ON CONFLICT DO NOTHING, then check rows affected.
```

## Module wiring
```ts
@Module({
  imports: [
    RabbitMQModule.forRootAsync({ ... }),
    MikroOrmModule.forFeature([AuditEvent]),
  ],
  providers: [PostsConsumer],
})
export class AuditModule {}
```

## After writing a consumer
- Write a unit test mocking `redis.set` to return `null` (already seen) and assert
  the handler returns early without touching the EntityManager.
- Write a test for the happy path: `redis.set` returns `'OK'`, EM is called.
- Run `pnpm lint && pnpm test`.
- Update `docs/PROGRESS.md`.
