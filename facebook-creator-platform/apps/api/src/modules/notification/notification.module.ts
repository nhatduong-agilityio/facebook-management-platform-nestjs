import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IHttpClient } from '../../common/http/http-client.port';
import { FetchHttpClientAdapter } from '../../common/http/fetch-http-client.adapter';
import { INotificationClient } from './ports/notification.client.port';
import { NotificationHttpClientAdapter } from './adapters/notification-http-client.adapter';
import { NotificationController } from './notification.controller';

/**
 * Proxy module that exposes `/workspaces/:id/notifications` and
 * `/notifications/:id/read` in `apps/api`.
 *
 * Auth: Clerk JWT + `WorkspaceRolesGuard` (any role).
 * Transport: delegates to `services/notification` via `NotificationHttpClientAdapter`.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationController],
  providers: [
    { provide: IHttpClient, useClass: FetchHttpClientAdapter },
    { provide: INotificationClient, useClass: NotificationHttpClientAdapter },
  ],
})
export class NotificationModule {}
