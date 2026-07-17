import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AuditService } from './audit.service';
import type { AuditEvent } from './entities/audit-event.entity';

/**
 * TCP RPC handlers for synchronous audit log reads from `apps/api` (ADR-094).
 *
 * Both handlers follow the §15 pattern: unwrap the `Result<T, AppError>` from
 * `AuditService` and either return the plain value or throw `RpcException`.
 *
 * CLAUDE.md §7 — audit is **read-only** via `apps/api`. No write patterns are
 * exposed here; all writes are handled by `AuditConsumer` (`@EventPattern('#')`).
 */
@Controller()
export class AuditMessageController {
  /** @param auditService - Read-side audit service over the MongoDB repository. */
  constructor(private readonly auditService: AuditService) {}

  /**
   * Returns audit events for a workspace, newest first.
   *
   * Pattern: `audit.get-logs`
   * Payload: `{ workspaceId: string; limit?: number; before?: string }`
   * Response: `AuditEvent[]` — empty array when no events exist.
   *
   * The `before` field is an ISO 8601 string (Date objects do not survive TCP
   * JSON serialisation); it is converted to `Date` before forwarding to the repo.
   *
   * @param dto - RPC payload with workspace UUID and optional pagination options.
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected repository failure.
   */
  @MessagePattern('audit.get-logs')
  async getWorkspaceAuditLogs(
    @Payload() dto: { workspaceId: string; limit?: number; before?: string },
  ): Promise<AuditEvent[]> {
    try {
      const result = await this.auditService.getWorkspaceAuditLogs(dto.workspaceId, {
        limit: dto.limit,
        before: dto.before ? new Date(dto.before) : undefined,
      });
      return result.match(
        (events) => events,
        (e) => { throw new RpcException({ code: 'INTERNAL', message: e.message }); },
      );
    } catch (e) {
      if (e instanceof RpcException) throw e;
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Audit service error',
      });
    }
  }

  /**
   * Returns a single audit event by its document id.
   *
   * Pattern: `audit.get-log`
   * Payload: `{ id: string }`
   * Response: `AuditEvent`
   *
   * @param dto - RPC payload with the audit document UUID.
   * @throws {RpcException} with `code: 'NOT_FOUND'` when the document does not exist.
   * @throws {RpcException} with `code: 'INTERNAL'` on unexpected repository failure.
   */
  @MessagePattern('audit.get-log')
  async getAuditEvent(@Payload() dto: { id: string }): Promise<AuditEvent> {
    try {
      const result = await this.auditService.getAuditEvent(dto.id);
      return result.match(
        (event) => event,
        (e) => { throw new RpcException({ code: e.code, message: e.message }); },
      );
    } catch (e) {
      if (e instanceof RpcException) throw e;
      throw new RpcException({
        code: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Audit service error',
      });
    }
  }
}
