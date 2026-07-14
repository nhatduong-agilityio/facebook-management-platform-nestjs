import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
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
import { BillingRabbitMqAdapter, BILLING_EVENT_BUS } from './adapters/billing-rabbitmq.adapter';
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
 * - `IBillingEventBus`         → `BillingRabbitMqAdapter` (publishes via `BILLING_EVENT_BUS` ClientProxy)
 * - `IStripeProvider`          → `StripeAdapter`
 *
 * `ClientsModule` is registered here (not in `AppModule`) so `BILLING_EVENT_BUS`
 * is visible to `BillingRabbitMqAdapter` within this module's DI scope.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Plan, Subscription, BillingEvent]),
    ClientsModule.registerAsync([
      {
        name: BILLING_EVENT_BUS,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: '',
            noAssert: true,
            exchange: 'fcp.events',
            exchangeType: 'topic',
          },
        }),
      },
    ]),
  ],
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
