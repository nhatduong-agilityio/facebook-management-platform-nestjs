---
name: rabbitmq-consumer
description: Use when writing a RabbitMQ event consumer with @nestjs/microservices Transport.RMQ so it is idempotent, durable, DLQ-backed, and acks/nacks correctly. Trigger on "consumer", "EventPattern", "RabbitMQ handler", "event listener", "process PostCreated", or any @EventPattern usage.
---

# Skill: RabbitMQ consumer (FCP — Transport.RMQ)

## When to use
Writing any `@EventPattern` handler — audit consumer (TR.6), analytics consumer
(TR.7), search indexer (TR.8), notification handler (TR.9), email consumer (TR.5),
apps/api consumers (TR.3).

## Rules (must hold)
1. **Idempotent first**: check `eventId` before doing any work. Use Redis `SET NX EX`
   (preferred) or a DB unique constraint on `event_id`.
2. **DLQ via `channel.nack(msg, false, false)`**: routes to `x-dead-letter-exchange`
   declared in `queueOptions.arguments` — never `return new Nack()`.
3. **Durable queue**: `durable: true` in `queueOptions` — survives broker restart.
4. **No side-effects before the dedup check.** The check must be the first await.
5. **Flush before publish** (CODING-STANDARDS.md §6). If this consumer also emits
   events, do it after `em.flush()`.
6. **Always ack or nack — never both, never neither.** Every code path must call
   exactly one of `channel.ack(msg)` or `channel.nack(msg, false, requeue)`.
7. **`noAck: false` required** in `getRmqOptions` / `getDlqRmqOptions` — the factory
   already sets this; do not override.
8. **Wrap handler body in `RequestContext.create()`** — HTTP middleware does not run
   for microservice handlers; MikroORM needs a request context to isolate the EM.
9. **No PII in consumed events.** Publishers strip it before publishing (§4/§6).
   If a consumed event contains PII, log an error and `channel.nack(msg, false, false)`.
10. **Consumer class is `@Controller()`**, listed in the module's `controllers[]` array
    — NOT `@Injectable()` in `providers[]`.

## Exchange / routing key conventions
```
exchange:      fcp.events          (topic, durable)
DLX:           fcp.dlq             (fanout, durable)
routing keys:  <domain>.<event>    e.g. posts.created, billing.subscription_activated
queue names:   <service>_queue     e.g. email_queue, audit_queue, api_queue
```

## Template

```ts
// services/<name>/src/<module>/<name>.consumer.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { uuidv7 } from 'uuidv7';

@Controller()
export class PostCreatedConsumer {
  constructor(
    private readonly orm: MikroORM,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles posts.created events from fcp.events topic exchange.
   * Idempotent via Redis SET NX; permanent failures route to fcp.dlq.
   */
  @EventPattern('posts.created')
  async handle(
    @Payload() data: PostCreatedPayload,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    // 1. Idempotency check — MUST be first
    const dedupKey = `dedup:posts.created:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      channel.ack(originalMsg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        const em = RequestContext.getEntityManager()!;

        // 2. Business logic
        const entity = em.create(SomeEntity, {
          id: uuidv7(),
          // ...
        });
        await em.flush(); // one transaction per message

        // 3. Downstream publish (if needed) goes AFTER flush
        // await this.bus.publish('domain.action', { ... });
      });

      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error({ err, eventId: data.eventId }, 'Consumer failed');

      if (isPermanentError(err)) {
        // Permanent failure → DLQ, keep dedup key (prevent retry on replay)
        channel.nack(originalMsg, false, false);
      } else {
        // Transient failure → clear dedup key so retry is allowed, nack to DLQ
        // (broker topology handles retry TTL queue; no in-app requeue)
        await this.redis.del(dedupKey);
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
```

## Wildcard consumer (audit service — `#` routing key)
```ts
@Controller()
export class AuditConsumer {
  @EventPattern('#')
  async handle(@Payload() data: unknown, @Ctx() context: RmqContext): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    const routingKey = context.getPattern(); // actual key e.g. 'posts.created'

    if (!isValidPayload(data)) {
      channel.nack(originalMsg, false, false); // permanent discard
      return;
    }
    try {
      await RequestContext.create(this.orm.em, async () => {
        // strip PII then insert into MongoDB
      });
      channel.ack(originalMsg);
    } catch {
      channel.nack(originalMsg, false, false);
    }
  }
}
```

## Module wiring
```ts
// Consumers go in controllers[], NOT providers[]
@Module({
  imports: [MikroOrmModule.forFeature([SomeEntity])],
  controllers: [PostCreatedConsumer],   // ← controllers, not providers
  providers: [/* services, repos */],
})
export class SomeModule {}
```

## main.ts wiring

### Pure microservice (services/email after TR.5)
```ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  getRmqOptions('email_queue', configService),
);
await app.listen();
```

### Hybrid app (apps/api TR.3; services/audit TR.6; analytics TR.7; search TR.8; notification TR.9)
```ts
const app = await NestFactory.create(AppModule);
// one connectMicroservice call per queue
app.connectMicroservice<MicroserviceOptions>(getRmqOptions('api_queue', configService));
app.connectMicroservice<MicroserviceOptions>(getDlqRmqOptions('dlq.logger', configService));
// startAllMicroservices BEFORE listen — order is mandatory
await app.startAllMicroservices();
await app.listen(port);
```

## After writing a consumer
- Write a unit test: `redis.set` returns `null` (duplicate) → `channel.ack` called, no DB access.
- Write a test: `redis.set` returns `'OK'` (new) → business logic runs → `channel.ack` called.
- Write a test: DB throws → `channel.nack(msg, false, false)` called.
- Run `pnpm lint && pnpm test`.
- Update `docs/PROGRESS.md`.
