import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { BillingEvent } from './entities/billing-event.entity';
import { IPlanRepository } from './ports/plan.repository.port';
import { ISubscriptionRepository } from './ports/subscription.repository.port';
import { IBillingEventRepository } from './ports/billing-event.repository.port';
import { IBillingEventBus } from './ports/billing-event-bus.port';
import { IStripeProvider } from './ports/stripe.provider.port';
import { StripeAdapter } from './adapters/stripe.adapter';
import { BillingRabbitMqAdapter } from './adapters/billing-rabbitmq.adapter';
import { MikroOrmPlanRepository } from './repositories/mikro-orm-plan.repository';
import { MikroOrmSubscriptionRepository } from './repositories/mikro-orm-subscription.repository';
import { MikroOrmBillingEventRepository } from './repositories/mikro-orm-billing-event.repository';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing.webhook.controller';

/**
 * Core billing module: Plans, Subscriptions, Stripe Checkout, and state machine (T3.2).
 *
 * Owns the `billing` Postgres schema. Exposes internal HTTP endpoints called by
 * `apps/api` and the Stripe webhook endpoint called by Stripe directly.
 *
 * Port bindings:
 * - `IPlanRepository`          → `MikroOrmPlanRepository`
 * - `ISubscriptionRepository`  → `MikroOrmSubscriptionRepository`
 * - `IBillingEventRepository`  → `MikroOrmBillingEventRepository`
 * - `IBillingEventBus`         → `BillingRabbitMqAdapter`
 * - `IStripeProvider`          → `StripeAdapter`
 */
@Module({
  imports: [MikroOrmModule.forFeature([Plan, Subscription, BillingEvent])],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    { provide: IPlanRepository, useClass: MikroOrmPlanRepository },
    { provide: ISubscriptionRepository, useClass: MikroOrmSubscriptionRepository },
    { provide: IBillingEventRepository, useClass: MikroOrmBillingEventRepository },
    { provide: IBillingEventBus, useClass: BillingRabbitMqAdapter },
    { provide: IStripeProvider, useClass: StripeAdapter },
  ],
})
export class BillingModule {}
