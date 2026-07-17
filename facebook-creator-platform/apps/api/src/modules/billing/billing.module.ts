import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IdentityModule } from '../identity/identity.module';
import { IPostQuotaProvider } from '../posts/ports/post-quota.provider.port';
import { IBillingHttpClient } from './ports/billing-http.client.port';
import { BillingTcpAdapter, BILLING_TCP_CLIENT } from './adapters/billing-tcp.adapter';
import { BillingQuotaAdapter } from './adapters/billing-quota.adapter';
import { BillingController } from './billing.controller';
import { BillingRedirectController } from './billing-redirect.controller';
import { BillingSubscriptionConsumer } from './consumers/billing-subscription.consumer';

/**
 * Thin proxy module in `apps/api` for billing operations.
 *
 * Owns NO entities or migrations — all billing domain logic lives in `services/billing`.
 * This module's responsibilities:
 * 1. Expose `POST /workspaces/:id/billing/checkout` and `GET /workspaces/:id/billing/subscription`
 *    with auth + role guards, forwarding to `services/billing` via TCP (ADR-094).
 * 2. Export `IPostQuotaProvider` (backed by TCP call to billing service) so
 *    `PostsModule` can check post limits without owning billing data.
 * 3. Consume `billing.subscription_activated` / `billing.subscription_cancelled` events
 *    from `fcp.events` via `BillingSubscriptionConsumer` (RabbitMQ, unchanged).
 *
 * Communication:
 * - Sync TCP (`BILLING_TCP_CLIENT`) to `services/billing` for checkout and quota lookups.
 * - Async RabbitMQ consumers for subscription state changes from `services/billing`.
 *
 * Port bindings:
 * - `IBillingHttpClient` → `BillingTcpAdapter` (TCP RPC, replaces HTTP adapter — ADR-094)
 * - `IPostQuotaProvider`  → `BillingQuotaAdapter` (exported for PostsModule)
 */
@Module({
  imports: [
    IdentityModule,
    ClientsModule.registerAsync([
      {
        name: BILLING_TCP_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('BILLING_TCP_HOST', 'localhost'),
            port: config.get<number>('BILLING_TCP_PORT', 4001),
          },
        }),
      },
    ]),
  ],
  controllers: [BillingController, BillingRedirectController, BillingSubscriptionConsumer],
  providers: [
    BillingTcpAdapter,
    { provide: IBillingHttpClient, useClass: BillingTcpAdapter },
    { provide: IPostQuotaProvider, useClass: BillingQuotaAdapter },
  ],
  exports: [IPostQuotaProvider],
})
export class BillingModule {}
