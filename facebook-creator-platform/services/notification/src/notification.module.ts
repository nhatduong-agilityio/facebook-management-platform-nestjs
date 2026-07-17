import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Notification } from './entities/notification.entity';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { WorkspaceMemberProjection } from './entities/workspace-member-projection.entity';
import { INotificationRepository } from './ports/notification.repository.port';
import { ISlackProvider } from './ports/slack.provider.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { MikroOrmNotificationRepository } from './adapters/mikro-orm-notification.repository';
import { SlackWebhookProvider } from './adapters/slack-webhook.provider';
import { InternalApiAdapter } from './adapters/internal-api.adapter';
import { NotificationOrchestrator } from './notification-orchestrator';
import { WorkspaceMemberReconciler } from './reconciliation/workspace-member.reconciler';
import { NotificationService } from './notification.service';
import { NotificationMessageController } from './notification.message-controller';

/* Projection consumers */
import { MemberInvitedConsumer } from './consumers/member-invited.consumer';
import { MemberJoinedConsumer } from './consumers/member-joined.consumer';
import { MemberRemovedConsumer } from './consumers/member-removed.consumer';
import { MemberRoleChangedConsumer } from './consumers/member-role-changed.consumer';

/* Notification consumers */
import { PostPublishedNotificationConsumer } from './consumers/post-published.consumer';
import { PostFailedNotificationConsumer } from './consumers/post-failed.consumer';
import { BillingSubscriptionActivatedConsumer } from './consumers/billing-subscription-activated.consumer';
import { BillingSubscriptionCancelledConsumer } from './consumers/billing-subscription-cancelled.consumer';
import { BillingSubscriptionPastDueConsumer } from './consumers/billing-subscription-past-due.consumer';
import { BillingPaymentFailedConsumer } from './consumers/billing-payment-failed.consumer';
import { FacebookTokenExpiringConsumer } from './consumers/facebook-token-expiring.consumer';

/**
 * Feature module for `services/notification`.
 *
 * Registers:
 * - MikroORM entity features for the `notification` schema.
 * - Port → adapter bindings for repository, Slack, and internal API.
 * - `NotificationOrchestrator` — fan-out + channel routing.
 * - `WorkspaceMemberReconciler` — cold-start projection sync via HTTP to `apps/api`
 *   (`GET /internal/workspaces/:id/members` — reverse direction, stays HTTP per ADR-094).
 * - `NotificationMessageController` — TCP `@MessagePattern` handlers for `apps/api`.
 * - All 4 projection consumers + 7 notification consumers in `controllers[]`
 *   as required by `@nestjs/microservices` for `@EventPattern` handler discovery.
 *
 * No HTTP server — `services/notification` has no external clients or webhooks.
 * `apps/api` reaches it via TCP `@MessagePattern` (ADR-094).
 *
 * Port bindings:
 * - `INotificationRepository` → `MikroOrmNotificationRepository`
 * - `ISlackProvider`          → `SlackWebhookProvider`
 * - `IInternalApiClient`      → `InternalApiAdapter`
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Notification, NotificationRecipient, WorkspaceMemberProjection]),
  ],
  controllers: [
    NotificationMessageController,
    /* Projection consumers */
    MemberInvitedConsumer,
    MemberJoinedConsumer,
    MemberRemovedConsumer,
    MemberRoleChangedConsumer,
    /* Notification consumers */
    PostPublishedNotificationConsumer,
    PostFailedNotificationConsumer,
    BillingSubscriptionActivatedConsumer,
    BillingSubscriptionCancelledConsumer,
    BillingSubscriptionPastDueConsumer,
    BillingPaymentFailedConsumer,
    FacebookTokenExpiringConsumer,
  ],
  providers: [
    { provide: INotificationRepository, useClass: MikroOrmNotificationRepository },
    { provide: ISlackProvider, useClass: SlackWebhookProvider },
    { provide: IInternalApiClient, useClass: InternalApiAdapter },
    NotificationOrchestrator,
    WorkspaceMemberReconciler,
    NotificationService,
  ],
})
export class NotificationModule {}
