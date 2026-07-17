import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { IAuditClient } from '../ports/audit-http.client.port';
import { DownstreamServiceError } from '../../../common/errors/downstream-service.error';
import type { AuditLogResponseDto } from '../dto/audit-log.dto';

/** DI token for the audit TCP `ClientProxy`. */
export const AUDIT_TCP_CLIENT = 'AUDIT_TCP_CLIENT';

/** Milliseconds before a TCP RPC call is abandoned and a 503 is surfaced. */
const TCP_TIMEOUT_MS = 3_000;

/** Raw audit event shape as received over TCP (JSON-serialised `AuditEvent`). */
interface RawAuditEvent {
  _id: string;
  eventId: string;
  routingKey: string;
  workspaceId: string | null;
  payload: Record<string, unknown>;
  /** ISO 8601 string — `Date` objects do not survive TCP JSON serialisation. */
  receivedAt: string;
}

/** Maps the wire response to `AuditLogResponseDto`, restoring the `receivedAt` Date. */
function toDto(raw: RawAuditEvent): AuditLogResponseDto {
  return {
    _id: raw._id,
    eventId: raw.eventId,
    routingKey: raw.routingKey,
    workspaceId: raw.workspaceId,
    payload: raw.payload,
    receivedAt: new Date(raw.receivedAt),
  };
}

/**
 * `IAuditClient` implementation backed by NestJS TCP transport (ADR-094).
 *
 * Replaces `AuditHttpClientAdapter` for synchronous audit-log reads from `apps/api`
 * to `services/audit`. Error mapping preserves the same `DownstreamServiceError`
 * contract so `AuditController` requires no changes.
 *
 * Error mapping:
 * - `RpcException({ code: 'NOT_FOUND' })` → `null` (matches the HTTP 404 → `null` contract)
 * - Any other `RpcException` → `DownstreamServiceError(500, 'audit')`
 * - Timeout / connection refused → `DownstreamServiceError(503, 'audit')`
 */
@Injectable()
export class AuditTcpAdapter extends IAuditClient {
  /** @param client - NestJS `ClientProxy` bound to the audit TCP transport. */
  constructor(@Inject(AUDIT_TCP_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  /**
   * Fetches audit events for a workspace via TCP (newest first).
   *
   * Pattern: `audit.get-logs` — payload `{ workspaceId, limit? }` → `AuditEvent[]`.
   * `limit` is forwarded as-is; `services/audit` applies its own default (50) when absent.
   *
   * @param workspaceId - UUID of the workspace.
   * @param limit       - Optional result cap.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async getWorkspaceAuditLogs(workspaceId: string, limit?: number): Promise<AuditLogResponseDto[]> {
    try {
      const raw = await firstValueFrom(
        this.client
          .send<RawAuditEvent[]>('audit.get-logs', { workspaceId, limit })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
      return raw.map(toDto);
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Fetches a single audit event by its document id via TCP.
   *
   * Pattern: `audit.get-log` — payload `{ id }` → `AuditEvent | RpcException(NOT_FOUND)`.
   * Returns `null` when the audit service reports `NOT_FOUND` (mirrors the HTTP 404 contract).
   *
   * @param id - UUID v7 document id (`_id`).
   * @returns Mapped `AuditLogResponseDto`, or `null` when the event does not exist.
   * @throws {DownstreamServiceError} on TCP failure or unexpected service error.
   */
  async getAuditEvent(id: string): Promise<AuditLogResponseDto | null> {
    try {
      const raw = await firstValueFrom(
        this.client.send<RawAuditEvent>('audit.get-log', { id }).pipe(timeout(TCP_TIMEOUT_MS)),
      );
      return toDto(raw);
    } catch (e) {
      if (
        e instanceof RpcException &&
        (e.getError() as { code?: string }).code === 'NOT_FOUND'
      ) {
        return null;
      }
      throw this.mapError(e);
    }
  }

  /**
   * Maps a TCP error to a `DownstreamServiceError` so callers retain the same
   * error-handling contract they had with `AuditHttpClientAdapter`.
   */
  private mapError(e: unknown): DownstreamServiceError {
    if (e instanceof RpcException) {
      return new DownstreamServiceError(500, 'audit');
    }
    return new DownstreamServiceError(503, 'audit');
  }
}
