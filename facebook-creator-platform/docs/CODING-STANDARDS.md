# Coding Standards — Facebook Creator Platform

These are the patterns Claude must follow. Each section has a **canonical example** —
copy the shape, don't reinvent it. Conventions trace back to the CR-01 design docs.

---

## 1. Result pattern (neverthrow) — no throwing for domain errors

Service methods return `Result<T, AppError>`. Controllers translate `Result` into HTTP.
Throw exceptions only for *unexpected* failures (infra down, programmer error).

### AppError taxonomy (`src/common/errors/app-error.ts`)
```ts
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'INVALID_STATE_TRANSITION'
  | 'CROSS_WORKSPACE'
  | 'INTERNAL';

export class AppError {
  constructor(
    readonly code: AppErrorCode,
    readonly message: string,
    readonly details?: Record<string, unknown>,
  ) {}

  static notFound(what: string, details?: Record<string, unknown>) {
    return new AppError('NOT_FOUND', `${what} not found`, details);
  }
  static forbidden(message = 'Forbidden') {
    return new AppError('FORBIDDEN', message);
  }
  static conflict(message: string, details?: Record<string, unknown>) {
    return new AppError('CONFLICT', message, details);
  }
}
```

### Service returning Result
```ts
import { Result, ok, err } from 'neverthrow';

async createPost(input: CreatePostInput): Promise<Result<Post, AppError>> {
  const ws = await this.em.findOne(Workspace, { id: input.workspaceId });
  if (!ws) return err(AppError.notFound('Workspace'));

  if (await this.overPostLimit(ws))
    return err(new AppError('PLAN_LIMIT_EXCEEDED', 'Post limit reached'));

  const post = this.posts.create(input);     // entity created in memory (id assigned now)
  post.recordEvent(new PostCreated(post.id)); // collect domain event
  await this.em.flush();                      // one transaction
  return ok(post);
}
```

### Controller mapping Result → HTTP (`src/common/http/result.interceptor.ts` or inline)
```ts
@Post()
async create(@Body() dto: CreatePostDto) {
  const res = await this.service.createPost(dto);
  return res.match(
    (post) => post,                       // 2xx
    (e) => { throw toHttpException(e); },  // maps AppError.code → Nest HttpException
  );
}
```
`toHttpException` maps: NOT_FOUND→404, FORBIDDEN→403, VALIDATION_ERROR→400,
CONFLICT/PLAN_LIMIT_EXCEEDED→409, INVALID_STATE_TRANSITION→409, INTERNAL→500.

### `toHttpException` implementation (`src/common/http/to-http-exception.ts`)
```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';

const CODE_STATUS: Record<string, HttpStatus> = {
  NOT_FOUND:                HttpStatus.NOT_FOUND,
  FORBIDDEN:                HttpStatus.FORBIDDEN,
  UNAUTHORIZED:             HttpStatus.UNAUTHORIZED,
  VALIDATION_ERROR:         HttpStatus.BAD_REQUEST,
  CONFLICT:                 HttpStatus.CONFLICT,
  PLAN_LIMIT_EXCEEDED:      HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  CROSS_WORKSPACE:          HttpStatus.FORBIDDEN,
  INTERNAL:                 HttpStatus.INTERNAL_SERVER_ERROR,
};

export function toHttpException(e: AppError): HttpException {
  return new HttpException(
    { code: e.code, message: e.message, ...(e.details && { details: e.details }) },
    CODE_STATUS[e.code] ?? HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
```

---

## 2. Base entity — UUID v7 keys + full timestamps + soft delete

Every entity extends this. **No `@PrimaryKey` default from the DB** — the id is set
in the constructor.

```ts
import { PrimaryKey, Property, Filter } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';

@Filter({ name: 'softDelete', cond: { deletedAt: null }, default: true })
export abstract class BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();                  // app-generated, time-ordered (R3)

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  deletedAt?: Date;                       // non-null ⇒ soft-deleted (R4)
}
```
Soft delete = set `deletedAt` then `flush()`. The default filter hides deleted rows.
Hard purge only via retention jobs.

---

## 3. Cross-schema references — uuid column, no relation, indexed

Same-schema relations use MikroORM relations. Cross-schema = scalar uuid + index,
**never** a `@ManyToOne` and **never** a DB FK (BR-R06, R8).

```ts
// analytics schema referencing core.posts — logical FK only
@Property({ type: 'uuid' })
@Index()                                  // R8: every FK (real or logical) is indexed
postId!: string;                          // logical ref to core.posts.id — no constraint
```

---

## 4. PII at rest — AES-256-GCM custom type

```ts
// src/common/crypto/encrypted-text.type.ts
import { Type, Platform } from '@mikro-orm/core';
import { encryptGcm, decryptGcm } from './aes-gcm';   // wraps node:crypto

export class EncryptedText extends Type<string | null, string | null> {
  convertToDatabaseValue(value: string | null) {
    return value == null ? value : encryptGcm(value); // "<keyId>:<iv>:<tag>:<ct>"
  }
  convertToJSValue(value: string | null) {
    return value == null ? value : decryptGcm(value);
  }
  getColumnType() { return 'text'; }
}
```
```ts
// usage on the entity
@Property({ type: EncryptedText })
accessToken!: string;   // BR-F11 — never returned by the API, never logged
```
Key from `PII_ENCRYPTION_KEY` (32-byte base64, env/KMS), rotatable via key-id prefix.

---

## 5. Logging — Pino with PII redaction (BR-F12)

```ts
// main.ts logger config
LoggerModule.forRoot({
  pinoHttp: {
    redact: {
      paths: ['req.headers.authorization', '*.email', '*.fullName',
              '*.accessToken', '*.token', 'req.body.token'],
      censor: '[REDACTED]',
    },
  },
});
```
Never `console.log`. Never log a user object directly — log ids.

---

## 6. Domain events — publish only after commit

```ts
// collect on the entity/aggregate, publish in a flush subscriber or after the use case
await this.em.flush();                 // commit first
await this.bus.publish('posts.published', new PostPublished(post.id)); // then publish
```
Consumers are **idempotent** and **at-least-once**. Audit Service consumes *every* event.

---

## 7. Stripe billing — guarded state machine

States: `trialing → active → grace_period(PAST_DUE) → cancelled` (+ recover).
Every transition is guarded (illegal transition ⇒ `err(INVALID_STATE_TRANSITION)`)
and writes a `billing_events` row (from/to/actor/timestamp). Free plan can only be
`trialing`/`active` (BR-F10). See `docs/reference/billing-state-machine.svg`.

---

## 8. Validation & DTOs
- Request DTOs validated with `class-validator` + global `ValidationPipe({ whitelist: true, transform: true })`.
- Domain invariants live in the service as Result errors, **not** only in DTOs.

```ts
// dto/create-post.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @ApiProperty()         @IsUUID()                    workspaceId!: string;
  @ApiProperty()         @IsUUID()                    facebookPageId!: string;
  @ApiProperty()         @IsString() @MaxLength(63206) content!: string;      // BR-F02
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;  // BR-F06
}
```
DTOs validate *shape and format* only. Business rules (quota, state, ownership) live in
the service and return `err(AppError)`, not DTO validation errors.

## 9. Comments — JSDoc on all public API surface

Every exported class, method, function, interface, type alias, and enum **must** have a
JSDoc block. Internal (non-exported) implementation code needs a comment only when the
*why* is non-obvious.

### Rules

- **Exported class** — one-line summary of its responsibility.
- **Exported method / function** — one-line summary + `@param` for each parameter whose
  purpose is not self-evident + `@returns` describing the value (including whether it is a
  `Result<T, AppError>` and what errors it can return).
- **Exported interface / type / enum** — one-line summary; document each member whose
  name alone does not explain its meaning.
- **Non-exported code** — only comment when there is a hidden constraint, a non-obvious
  invariant, or a workaround for a specific bug. Do not narrate what the code does.

### Canonical shape

```ts
/**
 * Manages workspace lifecycle: create, fetch, and soft-delete operations.
 * All mutating methods return Result<T, AppError> — never throw for domain errors.
 */
@Injectable()
export class WorkspaceService {
  /**
   * Finds an active workspace by id.
   *
   * @param id - UUID v7 of the workspace to fetch.
   * @returns ok(workspace) or err(NOT_FOUND) if it does not exist or is soft-deleted.
   */
  async getWorkspace(id: string): Promise<Result<Workspace, AppError>> { ... }

  /**
   * Creates a new workspace for the given owner.
   *
   * @param ownerId - UUID of the User who will own this workspace.
   * @param name    - Display name; max 100 chars (BR-F01).
   * @returns ok(workspace) or err(CONFLICT) if the owner already has a workspace with
   *          the same name, or err(PLAN_LIMIT_EXCEEDED) if the owner's plan is at quota.
   */
  async createWorkspace(ownerId: string, name: string): Promise<Result<Workspace, AppError>> { ... }
}
```

```ts
/**
 * Domain error codes for the Facebook Creator Platform.
 * Controllers map these to HTTP status codes via toHttpException().
 */
export type AppErrorCode =
  | 'NOT_FOUND'          // resource does not exist or is soft-deleted
  | 'FORBIDDEN'          // authenticated but not authorised
  | 'CONFLICT'           // unique constraint or business-rule violation
  | 'PLAN_LIMIT_EXCEEDED'; // owner's subscription plan does not allow this operation
```

### What NOT to comment

```ts
// BAD — restates the code, adds no information
/** Gets the user by id */
async getUserById(id: string) { ... }

// BAD — describes the current task, rots immediately
/** Added for the T1.3 identity flow */
export class ClerkGuard { ... }
```

---

## 10. Testing
- Unit: Vitest, colocate `*.spec.ts`. Mock the `EntityManager` with `vi.fn()`.
- Each service method: at least one `ok` path and one `err` path.
- API smoke + load: Artillery scenarios in `test/load/` (see the artillery skill).
- A task is not done until `pnpm lint && pnpm test` is green.

```ts
// workspace.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { WorkspaceService } from './workspace.service';
import { AppError } from '../../common/errors/app-error';

const mockEm = {
  findOne: vi.fn(),
  create: vi.fn(),
  flush:  vi.fn(),
} as unknown as EntityManager;

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    service = new WorkspaceService(mockEm);
    vi.clearAllMocks();
  });

  it('returns err(NOT_FOUND) when workspace is missing', async () => {
    vi.mocked(mockEm.findOne).mockResolvedValue(null);

    const result = await service.getWorkspace('non-existent-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND' satisfies AppError['code']);
  });

  it('returns ok(workspace) on the happy path', async () => {
    const ws = { id: 'ws-1', name: 'Test WS' };
    vi.mocked(mockEm.findOne).mockResolvedValue(ws);

    const result = await service.getWorkspace('ws-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(ws);
  });
});
```
Never test private methods. Never assert implementation details (which mocks were called
in what order) — assert outcomes (the `Result` value, the entity state).

## 10. File & naming layout
```
apps/api/src/
  modules/<domain>/         # identity, workspace, facebook, posts
    <domain>.module.ts
    <domain>.controller.ts
    <domain>.service.ts      # returns Result<T, AppError>
    entities/<x>.entity.ts
    dto/<x>.dto.ts
    events/<x>.event.ts
    <x>.service.spec.ts
  common/                    # errors, crypto, http, logging, base entity
services/<name>/             # billing, analytics, search, notification, email, audit
```
- Files: `kebab-case`. Classes: `PascalCase`. Vars/functions: `camelCase`.
- One exported class per file where practical.

---

## 11. RabbitMQ consumers — idempotent, at-least-once

```ts
// services/audit/src/audit.consumer.ts
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EntityManager } from '@mikro-orm/core';
import { Redis } from 'ioredis';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class AuditConsumer {
  constructor(private readonly em: EntityManager, private readonly redis: Redis) {}

  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.created',
    queue: 'audit.posts.created',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostCreated(msg: PostCreatedPayload): Promise<void | Nack> {
    // 1. Idempotency check — always first, no side-effects before this
    const isNew = await this.redis.set(`dedup:${msg.eventId}`, '1', 'EX', 86400, 'NX');
    if (!isNew) return;

    try {
      // 2. Business logic + flush
      this.em.create(AuditEvent, { id: uuidv7(), eventId: msg.eventId, payload: msg });
      await this.em.flush();
    } catch (err) {
      await this.redis.del(`dedup:${msg.eventId}`); // allow retry
      throw err;                                     // RabbitMQ redelivers
    }
  }
}
```

Rules:

1. **Idempotency first**: Redis `SET NX EX` (or DB unique on `event_id`). Must be the
   first `await`; no side-effects before it.
2. **Durable queue + DLX**: `durable: true` + `deadLetterExchange: 'fcp.dlq'` on every
   queue. Unprocessable messages go to the DLQ after retries, not lost.
3. **Transient errors → throw** (RabbitMQ redelivers). Clear the dedup key first.
   **Permanent errors → return `new Nack(false)`** (schema mismatch, unrecoverable).
4. **No PII in consumed events** — publishers strip it. If a consumed message contains
   PII, log an error + `return new Nack(false)` (don't retry PII leaks).
5. Consumers never publish downstream events inside the same handler — use a scheduled
   outbox or a separate step after `flush()`.

See the `rabbitmq-consumer` skill for the full template and test patterns.

---

## 12. Performance — index first, query second, cache last

**Order is mandatory.** Never jump to a later stage without evidence from the earlier one.

1. **Schema + indexes** — add the right index *in the migration* for every access
   pattern, every FK (real and logical). This is Week 1–4 work, per task. Cost: zero.
2. **Query optimization** — run `EXPLAIN ANALYZE`; eliminate N+1 with MikroORM
   `populate`; use keyset pagination instead of OFFSET on large tables; keep
   `em.flush()` outside loops. Do this in T4.4 / the T5.1–T5.4 verification pass.
3. **Cache** — add a Redis cache layer **only** when T5.5 Artillery results prove
   a target (p99 < 300 ms read / p99 < 500 ms write) cannot be met after steps 1–2.

Cache adds three new failure modes that indexing does not: invalidation bugs, stale
reads, and a monitoring surface. Never add caching speculatively.

### Redis sanctioned uses in this project

| Use | Key pattern | Stage |
| --- | --- | --- |
| Consumer dedup (idempotency) | `dedup:<eventId>` | Week 2–4 with each consumer |
| Auth / RBAC result cache | `rbac:<userId>:<workspaceId>` | Week 5 — only if T5.5 proves needed |
| API response cache | `cache:<route>:<params>` | Week 5 — only if T5.5 proves needed |

When adding any cache beyond consumer dedup: record the benchmark that justified it
in `docs/DECISIONS.md` (before/after p99, load level tested).
