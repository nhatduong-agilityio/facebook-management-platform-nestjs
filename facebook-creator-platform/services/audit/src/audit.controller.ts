import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-event.entity';

/**
 * Internal HTTP controller for the audit service.
 *
 * Called by `apps/api` — no Clerk JWT required at this layer (apps/api enforces
 * auth before proxying). Owner-only enforcement and Swagger docs are added in T3.5.
 */
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Returns audit events for a workspace, newest first.
   *
   * @param workspaceId - UUID of the workspace.
   * @param limit       - Max results (default 50, max 200).
   */
  @Get('workspaces/:workspaceId/audit-logs')
  async getWorkspaceAuditLogs(
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ): Promise<AuditEvent[]> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
    const result = await this.auditService.getWorkspaceAuditLogs(workspaceId, { limit: parsedLimit });
    return result._unsafeUnwrap();
  }

  /**
   * Returns a single audit event by its document id.
   *
   * @param id - The `_id` (UUID v7) of the audit document.
   */
  @Get('audit-logs/:id')
  async getAuditEvent(@Param('id') id: string): Promise<AuditEvent> {
    const result = await this.auditService.getAuditEvent(id);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }
}
