import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IPostQuotaProvider } from '../posts/ports/post-quota.provider.port';
import { IBillingHttpClient } from './ports/billing-http.client.port';
import { BillingHttpClientAdapter } from './adapters/billing-http-client.adapter';
import { BillingQuotaAdapter } from './adapters/billing-quota.adapter';
import { BillingController } from './billing.controller';
import { BillingRedirectController } from './billing-redirect.controller';
import { BillingSubscriptionConsumer } from './consumers/billing-subscription.consumer';

/**
 * Thin proxy module in `apps/api` for billing operations.
 *
 * Owns NO entities or migrations — all billing domain logic lives in `services/billing`.
 * This module's responsibilities:
 * 1. Expose `POST /workspaces/:id/billing/checkout` with auth + role guards, then
 *    forward to `services/billing` via HTTP.
 * 2. Export `IPostQuotaProvider` (backed by HTTP call to billing service) so
 *    `PostsModule` can check post limits without owning billing data.
 * 3. Consume `billing.subscription_activated` / `billing.subscription_cancelled` events
 *    from `fcp.events` (T3.2 placeholders; full logic in T4.2/T4.3).
 *
 * Communication:
 * - Sync HTTP to `services/billing` for checkout and quota lookups.
 * - Async RabbitMQ consumers for subscription state changes from `services/billing`.
 *
 * Port bindings:
 * - `IBillingHttpClient` → `BillingHttpClientAdapter` (native fetch, BILLING_SERVICE_URL)
 * - `IPostQuotaProvider`  → `BillingQuotaAdapter` (exported for PostsModule)
 */
@Module({
  imports: [IdentityModule],
  controllers: [BillingController, BillingRedirectController],
  providers: [
    { provide: IBillingHttpClient, useClass: BillingHttpClientAdapter },
    { provide: IPostQuotaProvider, useClass: BillingQuotaAdapter },
    BillingSubscriptionConsumer,
  ],
  exports: [IPostQuotaProvider],
})
export class BillingModule {}
