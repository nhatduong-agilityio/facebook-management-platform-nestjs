import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Subscription } from '../entities/subscription.entity';
import { ISubscriptionRepository } from '../ports/subscription.repository.port';

/**
 * MikroORM implementation of `ISubscriptionRepository` — queries `billing.subscriptions`.
 */
@Injectable()
export class MikroOrmSubscriptionRepository extends ISubscriptionRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /** @inheritdoc */
  async findByWorkspaceId(workspaceId: string): Promise<Subscription | null> {
    return this.em.findOne(Subscription, { workspaceId }, { populate: ['plan'] });
  }

  /** @inheritdoc */
  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return this.em.findOne(Subscription, { stripeSubscriptionId }, { populate: ['plan'] });
  }

  /** @inheritdoc */
  async save(subscription: Subscription): Promise<void> {
    this.em.persist(subscription);
  }
}
