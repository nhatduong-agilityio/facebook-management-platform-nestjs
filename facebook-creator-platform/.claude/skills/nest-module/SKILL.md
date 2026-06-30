---
name: nest-module
description: Use when creating a new NestJS feature module in apps/api (controller + service + entities + DTOs + events + tests) so it follows FCP conventions — Result pattern, MikroORM BaseEntity, app-gen uuid v7, soft delete, PII rules, cross-schema logical FKs, and Swagger. Trigger on "new module", "scaffold module", "add a <domain> module".
---

# Skill: Scaffold a NestJS feature module

## When to use
Creating any new feature module under `apps/api/src/modules/<name>/`, or a new
supporting service under `services/<name>/`.

## Required shape
```
modules/<name>/
  <name>.module.ts
  <name>.controller.ts        # Result -> HTTP, Swagger
  <name>.service.ts           # returns Result<T, AppError>
  entities/<x>.entity.ts      # extends BaseEntity
  dto/<x>.dto.ts              # class-validator
  events/<x>.event.ts         # domain events
  <name>.service.spec.ts      # ok-path + err-path
```

## Rules (must hold)
1. Service methods return `Result<T, AppError>` (neverthrow). No `throw` for
   validation / not-found / conflict / forbidden / state-transition. Throw only
   for unexpected infra errors.
2. Entities extend `BaseEntity` — id is `uuidv7()` (no DB default), with
   `createdAt`/`updatedAt`/`deletedAt`. Deletes are soft.
3. Same-schema relations → MikroORM relation decorators. Cross-schema refs →
   plain `@Property({type:'uuid'})` + `@Index()`, **no** relation, **no** FK.
4. Tokens/secrets use `EncryptedText`. Never log or serialize PII.
5. State mutations collect a domain event and publish **after** `em.flush()`.
6. Controller uses the shared `Result -> HttpException` mapper; add `@ApiTags`,
   `@ApiOperation`, `@ApiResponse`.
7. Register the module's entities with MikroORM in `<name>.module.ts`.

## Templates

### service
```ts
@Injectable()
export class <Name>Service {
  constructor(private readonly em: EntityManager, private readonly bus: EventBus) {}

  async create(input: Create<Name>Input): Promise<Result<<Name>, AppError>> {
    // guards -> err(...); happy path -> entity.create -> recordEvent -> flush -> ok(...)
  }
}
```

### controller
```ts
@ApiTags('<name>')
@Controller('<name>')
export class <Name>Controller {
  constructor(private readonly service: <Name>Service) {}

  @Post()
  @ApiOperation({ summary: 'Create <name>' })
  async create(@Body() dto: Create<Name>Dto) {
    return (await this.service.create(dto)).match(
      (v) => v,
      (e) => { throw toHttpException(e); },
    );
  }
}
```

### entity
```ts
@Entity({ schema: '<schema>', tableName: '<table>' })
export class <Name> extends BaseEntity {
  @Property() name!: string;
  // same-schema relation:
  @ManyToOne(() => Other, { deleteRule: 'cascade' }) other!: Other;
  // cross-schema logical FK:
  @Property({ type: 'uuid' }) @Index() workspaceId!: string;
}
```

## After scaffolding
- Add the entities to a migration (`pnpm mikro-orm migration:create`) — verify
  the diff matches `docs/reference/fcp-ddl.sql`.
- Run `pnpm lint && pnpm test`.
- Update `docs/PROGRESS.md`.
