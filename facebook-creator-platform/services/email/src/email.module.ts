import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EmailDeliveryLog } from './entities/email-delivery-log.entity';
import { IEmailProvider } from './ports/email.provider.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { IEmailDeliveryLogRepository } from './ports/email-delivery-log.repository.port';
import { ResendEmailProvider } from './adapters/resend-email.provider';
import { InternalApiAdapter } from './adapters/internal-api.adapter';
import { MikroOrmEmailDeliveryLogRepository } from './repositories/mikro-orm-email-delivery-log.repository';
import { MemberInvitedEmailConsumer } from './consumers/member-invited.consumer';
import { PostPublishedEmailConsumer } from './consumers/post-published.consumer';
import { PostFailedEmailConsumer } from './consumers/post-failed.consumer';
import { BillingPaymentFailedEmailConsumer } from './consumers/billing-payment-failed.consumer';
import { FacebookTokenExpiringEmailConsumer } from './consumers/facebook-token-expiring.consumer';

/**
 * Email feature module.
 *
 * Wires all 5 RabbitMQ consumers, the `IEmailProvider` and `IInternalApiClient`
 * ports to their adapters, and the `IEmailDeliveryLogRepository` to its MikroORM adapter.
 * Retry logic is handled by RabbitMQ redelivery + DLX (no separate job queue needed).
 */
@Module({
  imports: [MikroOrmModule.forFeature([EmailDeliveryLog])],
  controllers: [
    MemberInvitedEmailConsumer,
    PostPublishedEmailConsumer,
    PostFailedEmailConsumer,
    BillingPaymentFailedEmailConsumer,
    FacebookTokenExpiringEmailConsumer,
  ],
  providers: [
    { provide: IEmailProvider, useClass: ResendEmailProvider },
    { provide: IInternalApiClient, useClass: InternalApiAdapter },
    { provide: IEmailDeliveryLogRepository, useClass: MikroOrmEmailDeliveryLogRepository },
  ],
})
export class EmailModule {}
