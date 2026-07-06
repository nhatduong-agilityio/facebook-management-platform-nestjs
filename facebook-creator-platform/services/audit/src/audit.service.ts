import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { AuditEvent } from './entities/audit-event.entity';
import { IAuditEventRepository, FindByWorkspaceOptions } from './ports/audit-event.repository.port';
import { AppError } from './common/app-error';

/**
 * Read-side service for the audit log.
 *
 * Write path is handled entirely by `AuditConsumer` — this service only serves
 * `GET` endpoints called by `apps/api` (T3.5).
 */
@Injectable()
export class AuditService {
  constructor(private readonly repo: IAuditEventRepository) {}

  /**
   * Returns audit events for a workspace, newest first.
   *
   * @param workspaceId - UUID of the workspace to query.
   * @param opts        - Pagination options forwarded to the repository.
   * @returns ok(events) — always succeeds; empty array when no events exist.
   */
  async getWorkspaceAuditLogs(
    workspaceId: string,
    opts?: FindByWorkspaceOptions,
  ): Promise<Result<AuditEvent[], AppError>> {
    const events = await this.repo.findByWorkspace(workspaceId, opts);
    return ok(events);
  }

  /**
   * Finds a single audit event by its document id.
   *
   * @param id - The `_id` (UUID v7) of the audit document.
   * @returns ok(event) or err(NOT_FOUND) if the document does not exist.
   */
  async getAuditEvent(id: string): Promise<Result<AuditEvent, AppError>> {
    const event = await this.repo.findById(id);
    if (!event) return err(AppError.notFound(`AuditEvent ${id}`));
    return ok(event);
  }
}
