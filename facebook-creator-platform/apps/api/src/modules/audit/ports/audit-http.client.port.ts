import type { AuditLogResponseDto } from '../dto/audit-log.dto';

/**
 * Port: outbound client contract for the audit service.
 *
 * Transport-agnostic by design — rename from `IAuditHttpClient` to `IAuditClient`
 * so a future RabbitMQ RPC adapter can implement the same interface without leaking
 * HTTP in the name. Bound to `AuditHttpClientAdapter` in `AuditModule`.
 */
export abstract class IAuditClient {
  /**
   * Returns audit events for a workspace, newest first.
   *
   * @param workspaceId - UUID of the workspace to query.
   * @param limit       - Maximum results (default 50, max 200).
   * @returns Array of audit event DTOs.
   */
  abstract getWorkspaceAuditLogs(workspaceId: string, limit?: number): Promise<AuditLogResponseDto[]>;

  /**
   * Fetches a single audit event by its document id.
   *
   * @param id - UUID v7 document id (`_id`).
   * @returns The event DTO, or `null` when the audit service responds 404.
   */
  abstract getAuditEvent(id: string): Promise<AuditLogResponseDto | null>;
}
