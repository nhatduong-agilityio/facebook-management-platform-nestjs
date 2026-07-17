import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IdentityModule } from '../identity/identity.module';
import { INotificationClient } from './ports/notification.client.port';
import {
  NotificationTcpAdapter,
  NOTIFICATION_TCP_CLIENT,
} from './adapters/notification-tcp.adapter';
import { NotificationController } from './notification.controller';

/**
 * Proxy module that exposes `/workspaces/:id/notifications` and
 * `/notifications/:id/read` in `apps/api`.
 *
 * Auth: Clerk JWT + `WorkspaceRolesGuard` (any role).
 * Transport: delegates to `services/notification` via `NotificationTcpAdapter` (ADR-094).
 *
 * Communication:
 * - Sync TCP (`NOTIFICATION_TCP_CLIENT`) to `services/notification` for list and mark-read.
 *
 * Port bindings:
 * - `INotificationClient` → `NotificationTcpAdapter` (TCP RPC, replaces HTTP adapter — ADR-094)
 */
@Module({
  imports: [
    IdentityModule,
    ClientsModule.registerAsync([
      {
        name: NOTIFICATION_TCP_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('NOTIFICATION_TCP_HOST', 'localhost'),
            port: config.get<number>('NOTIFICATION_TCP_PORT', 3005),
          },
        }),
      },
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationTcpAdapter,
    { provide: INotificationClient, useClass: NotificationTcpAdapter },
  ],
})
export class NotificationModule {}
