import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { INotificationClient } from '../ports/notification.client.port';
import { DownstreamServiceError } from '../../../common/errors/downstream-service.error';
import type { NotificationResponseDto } from '../dto/notification.dto';

/** DI token for the notification TCP `ClientProxy`. */
export const NOTIFICATION_TCP_CLIENT = 'NOTIFICATION_TCP_CLIENT';

/** Milliseconds before a TCP RPC call is abandoned and a 503 is surfaced. */
const TCP_TIMEOUT_MS = 3_000;

/**
 * `INotificationClient` implementation backed by NestJS TCP transport (ADR-094).
 *
 * Replaces `NotificationHttpClientAdapter` as the concrete adapter for sync
 * notification calls from `apps/api` to `services/notification`. Error mapping
 * preserves the same `DownstreamServiceError` contract so `NotificationController`
 * requires no changes.
 *
 * Error mapping:
 * - Any `RpcException` → `DownstreamServiceError(500)`
 * - Timeout / connection refused → `DownstreamServiceError(503)`
 */
@Injectable()
export class NotificationTcpAdapter extends INotificationClient {
  /** @param client - NestJS `ClientProxy` bound to the notification TCP transport. */
  constructor(@Inject(NOTIFICATION_TCP_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  /**
   * Fetches recent notifications for a user in a workspace via TCP.
   *
   * Pattern: `notification.list` — payload `{ workspaceId, userId }` → `NotificationResponseDto[]`.
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the requesting user (recipient filter).
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async getNotifications(workspaceId: string, userId: string): Promise<NotificationResponseDto[]> {
    try {
      return await firstValueFrom(
        this.client
          .send<NotificationResponseDto[]>('notification.list', { workspaceId, userId })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Marks a notification as read for a recipient via TCP (BR-F08 — one-way).
   *
   * Pattern: `notification.mark-read` — payload `{ notificationId, userId }` → `{ updated: boolean }`.
   * The `{ updated }` response is discarded — already-read is a silent no-op per BR-F08.
   *
   * @param notificationId - UUID of the notification record.
   * @param userId         - UUID of the recipient marking as read.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.client
          .send<{ updated: boolean }>('notification.mark-read', { notificationId, userId })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Maps a TCP error to a `DownstreamServiceError` so callers retain the same
   * error-handling contract they had with `NotificationHttpClientAdapter`.
   */
  private mapError(e: unknown): DownstreamServiceError {
    if (e instanceof RpcException) {
      return new DownstreamServiceError(500, 'notification');
    }
    return new DownstreamServiceError(503, 'notification');
  }
}
