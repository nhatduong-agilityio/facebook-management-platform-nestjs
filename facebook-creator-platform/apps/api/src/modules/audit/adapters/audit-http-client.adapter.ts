import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IHttpClient, DownstreamServiceError } from '../../../common/http/http-client.port';
import { IAuditClient } from '../ports/audit-http.client.port';
import type { AuditLogResponseDto } from '../dto/audit-log.dto';

/** Raw shape returned by `services/audit` over HTTP. `receivedAt` is an ISO string in transit. */
interface RawAuditEvent {
  _id: string;
  eventId: string;
  routingKey: string;
  workspaceId: string | null;
  payload: Record<string, unknown>;
  receivedAt: string;
}

/** Maps the raw HTTP response shape to the API's public `AuditLogResponseDto`. */
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
 * `IAuditClient` implementation that calls `services/audit` over HTTP.
 *
 * Injects `IHttpClient` for transport — swapping to Axios or RabbitMQ RPC
 * requires only a new `IHttpClient` binding, not a rewrite of this adapter.
 *
 * Reads `AUDIT_SERVICE_URL` from config via `getOrThrow` — fails fast at startup
 * if the env var is absent (avoids runtime surprises).
 */
@Injectable()
export class AuditHttpClientAdapter extends IAuditClient {
  private readonly baseUrl: string;

  /**
   * @param http   - Outbound HTTP client (native fetch by default).
   * @param config - NestJS ConfigService; must have `AUDIT_SERVICE_URL` set.
   */
  constructor(
    private readonly http: IHttpClient,
    private readonly config: ConfigService,
  ) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('AUDIT_SERVICE_URL');
  }

  /**
   * Calls `GET /workspaces/:workspaceId/audit-logs` on the audit service.
   *
   * @param workspaceId - UUID of the workspace.
   * @param limit       - Optional result cap forwarded as a query param.
   * @returns Array of mapped `AuditLogResponseDto` objects.
   */
  async getWorkspaceAuditLogs(workspaceId: string, limit?: number): Promise<AuditLogResponseDto[]> {
    const url = new URL(`${this.baseUrl}/workspaces/${workspaceId}/audit-logs`);
    if (limit !== undefined) url.searchParams.set('limit', String(limit));

    const raw = await this.http.get<RawAuditEvent[]>(url.toString());
    return raw.map(toDto);
  }

  /**
   * Calls `GET /audit-logs/:id` on the audit service.
   *
   * @param id - UUID v7 document id.
   * @returns Mapped `AuditLogResponseDto`, or `null` when the service returns 404.
   */
  async getAuditEvent(id: string): Promise<AuditLogResponseDto | null> {
    try {
      const raw = await this.http.get<RawAuditEvent>(`${this.baseUrl}/audit-logs/${id}`);
      return toDto(raw);
    } catch (e) {
      if (e instanceof DownstreamServiceError && e.status === 404) return null;
      throw e;
    }
  }
}
