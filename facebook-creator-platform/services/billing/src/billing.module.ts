import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { IPlanRepository } from './ports/plan.repository.port';
import { ISubscriptionRepository } from './ports/subscription.repository.port';
import { IStripeProvider } from './ports/stripe.provider.port';
import { StripeAdapter } from './adapters/stripe.adapter';
import { MikroOrmPlanRepository } from './repositories/mikro-orm-plan.repository';
import { MikroOrmSubscriptionRepository } from './repositories/mikro-orm-subscription.repository';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Core billing module: Plans, Subscriptions, and Stripe Checkout.
 *
 * Owns the `billing` Postgres schema. Exposes internal HTTP endpoints called by
 * `apps/api`. Publishes domain events to RabbitMQ after state transitions (T3.2).
 *
 * Port bindings:
 * - `IPlanRepository`         → `MikroOrmPlanRepository`
 * - `ISubscriptionRepository` → `MikroOrmSubscriptionRepository`
 * - `IStripeProvider`         → `StripeAdapter`
 */
@Module({
  imports: [MikroOrmModule.forFeature([Plan, Subscription])],
  controllers: [BillingController],
  providers: [
    BillingService,
    { provide: IPlanRepository, useClass: MikroOrmPlanRepository },
    { provide: ISubscriptionRepository, useClass: MikroOrmSubscriptionRepository },
    { provide: IStripeProvider, useClass: StripeAdapter },
  ],
})
export class BillingModule {}
