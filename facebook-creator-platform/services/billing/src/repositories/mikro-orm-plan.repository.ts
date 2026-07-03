import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Plan } from '../entities/plan.entity';
import { IPlanRepository } from '../ports/plan.repository.port';

/**
 * MikroORM implementation of `IPlanRepository` — queries `billing.plans`.
 */
@Injectable()
export class MikroOrmPlanRepository extends IPlanRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** @inheritdoc */
  async findByCode(code: string): Promise<Plan | null> {
    return this.em.findOne(Plan, { code });
  }
}
