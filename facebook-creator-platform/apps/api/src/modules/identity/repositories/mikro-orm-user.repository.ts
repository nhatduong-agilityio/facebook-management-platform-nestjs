import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { User } from '../entities/user.entity';
import { IUserRepository } from '../ports/user.repository.port';

/**
 * MikroORM adapter for `IUserRepository`.
 *
 * All ORM-specific imports (`EntityRepository`, `EntityManager`) are confined
 * to this class. The application layer (service) depends only on the port.
 */
@Injectable()
export class MikroOrmUserRepository extends IUserRepository {
  constructor(
    @InjectRepository(User) private readonly repo: EntityRepository<User>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  findByClerkId(clerkUserId: string): Promise<User | null> {
    return this.repo.findOne({ clerkUserId });
  }

  /** @inheritdoc */
  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ id });
  }

  /**
   * Persists the entity via MikroORM's Unit of Work.
   *
   * `persist` marks the entity for insertion; `flush` executes the single
   * transaction. Appropriate here because `getOrCreateUser` is the only write
   * per request. For multi-aggregate operations in later tasks, coordinate
   * flush at the service or interceptor level.
   *
   * @inheritdoc
   */
  async save(user: User): Promise<void> {
    this.em.persist(user);
    await this.em.flush();
  }
}
