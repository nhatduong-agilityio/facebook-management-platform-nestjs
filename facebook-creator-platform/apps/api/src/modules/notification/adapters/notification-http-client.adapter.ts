import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IHttpClient } from '../../../common/http/http-client.port';
import { INotificationClient } from '../ports/notification.client.port';
import type { NotificationResponseDto } from '../dto/notification.dto';

/**
 * `INotificationClient` implementation that calls `services/notification` over HTTP.
 *
 * Reads `NOTIFICATION_SERVICE_URL` from config via `getOrThrow` — fails fast at startup
 * if the env var is absent.
 */
@Injectable()
export class NotificationHttpClientAdapter extends INotificationClient {
  private readonly baseUrl: string;

  /**
   * @param http   - Outbound HTTP client (native fetch by default).
   * @param config - NestJS ConfigService; must have `NOTIFICATION_SERVICE_URL` set.
   */
  constructor(
    private readonly http: IHttpClient,
    private readonly config: ConfigService,
  ) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('NOTIFICATION_SERVICE_URL');
  }

  /** {@inheritDoc INotificationClient.getNotifications} */
  async getNotifications(
    workspaceId: string,
    userId: string,
  ): Promise<NotificationResponseDto[]> {
    return this.http.get<NotificationResponseDto[]>(
      `${this.baseUrl}/workspaces/${workspaceId}/notifications?userId=${encodeURIComponent(userId)}`,
    );
  }

  /** {@inheritDoc INotificationClient.markAsRead} */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.http.patch<void>(
      `${this.baseUrl}/notifications/${notificationId}/read`,
      { userId },
    );
  }
}
