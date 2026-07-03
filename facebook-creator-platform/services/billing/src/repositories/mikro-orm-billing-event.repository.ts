import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BillingEvent } from '../entities/billing-event.entity';
import { IBillingEventRepository } from '../ports/billing-event.repository.port';

/**
 * MikroORM implementation of `IBillingEventRepository` — queries `billing.billing_events`.
 */
@Injectable()
export class MikroOrmBillingEventRepository extends IBillingEventRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** @inheritdoc */
  async findByStripeEventId(stripeEventId: string): Promise<BillingEvent | null> {
    return this.em.findOne(BillingEvent, { stripeEventId });
  }

  /** @inheritdoc */
  async save(event: BillingEvent): Promise<void> {
    this.em.persist(event);
  }
}
