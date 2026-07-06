import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { AppError } from '../../common/errors/app-error';
import { DownstreamServiceError } from '../../common/http/http-client.port';
import { IAuditClient } from './ports/audit-http.client.port';
import { AuditLogResponseDto } from './dto/audit-log.dto';

/** Maps a caught downstream error to a clean `AppError` without exposing transport details. */
function mapDownstreamError(e: unknown): AppError {
  if (e instanceof DownstreamServiceError) {
    return e.status >= 500
      ? AppError.serviceUnavailable('Audit service')
      : AppError.internal(`Audit service responded with unexpected ${e.status}`);
  }
  return AppError.internal('Unexpected error from audit service');
}

/**
 * Proxy audit-log endpoints in `apps/api`.
 *
 * All business logic and persistence live in `services/audit`. This controller:
 * 1. Enforces Clerk JWT authentication and Owner-only workspace role.
 * 2. Forwards requests to `services/audit` via `IAuditClient`.
 * 3. Exposes Swagger docs for API consumers.
 *
 * Routes:
 * - `GET /workspaces/:workspaceId/audit-logs` — list workspace audit events.
 * - `GET /workspaces/:workspaceId/audit-logs/:auditId` — single audit event.
 */
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, WorkspaceRolesGuard)
@Roles('owner')
@Controller('workspaces/:workspaceId')
export class AuditController {
  /** @param auditClient - Transport-agnostic client for the audit service. */
  constructor(private readonly auditClient: IAuditClient) {}

  /**
   * Returns audit events for a workspace, newest first.
   *
   * Proxies to `services/audit GET /workspaces/:workspaceId/audit-logs`.
   *
   * @param workspaceId - UUID of the workspace (from URL; also read by the auth guard).
   * @param limit       - Optional max results (1–200, default 50).
   * @returns Array of `AuditLogResponseDto` — empty when no events exist yet.
   */
  @Get('audit-logs')
  @ApiOperation({ summary: 'List audit events for a workspace (newest first)' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default 50, max 200)', example: 50 })
  @ApiOkResponse({ type: [AuditLogResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Clerk JWT.' })
  @ApiForbiddenResponse({ description: 'User is not an Owner of this workspace.' })
  @ApiServiceUnavailableResponse({ description: 'Audit service is unreachable.' })
  async getWorkspaceAuditLogs(
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ): Promise<AuditLogResponseDto[]> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : undefined;
    try {
      return await this.auditClient.getWorkspaceAuditLogs(workspaceId, parsedLimit);
    } catch (e) {
      throw toHttpException(mapDownstreamError(e));
    }
  }

  /**
   * Returns a single audit event by its document id.
   *
   * Proxies to `services/audit GET /audit-logs/:id`. The workspaceId in the URL
   * path is used only by the auth guard — the document id alone identifies the record.
   *
   * @param auditId - UUID v7 `_id` of the audit document.
   * @returns The `AuditLogResponseDto`.
   */
  @Get('audit-logs/:auditId')
  @ApiOperation({ summary: 'Get a single audit event by document id' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'auditId', description: 'Audit document UUID v7 (_id)' })
  @ApiOkResponse({ type: AuditLogResponseDto })
  @ApiNotFoundResponse({ description: 'Audit event not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Clerk JWT.' })
  @ApiForbiddenResponse({ description: 'User is not an Owner of this workspace.' })
  @ApiServiceUnavailableResponse({ description: 'Audit service is unreachable.' })
  async getAuditEvent(@Param('auditId') auditId: string): Promise<AuditLogResponseDto> {
    try {
      const event = await this.auditClient.getAuditEvent(auditId);
      if (!event) throw new NotFoundException(`Audit event ${auditId} not found`);
      return event;
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw toHttpException(mapDownstreamError(e));
    }
  }
}
