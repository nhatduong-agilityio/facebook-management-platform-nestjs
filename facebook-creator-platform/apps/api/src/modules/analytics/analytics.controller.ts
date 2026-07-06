import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
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
import { IAnalyticsClient } from './ports/analytics-http.client.port';
import { MetricsSummaryDto } from './dto/analytics.dto';

/** Maps a caught downstream error to a clean `AppError` without exposing transport details. */
function mapDownstreamError(e: unknown): AppError {
  if (e instanceof DownstreamServiceError) {
    return e.status >= 500
      ? AppError.serviceUnavailable('Analytics service')
      : AppError.internal(`Analytics service responded with unexpected ${e.status}`);
  }
  return AppError.internal('Unexpected error from analytics service');
}

/**
 * Proxy analytics endpoints in `apps/api`.
 *
 * All metric data lives in `services/analytics`. This controller:
 * 1. Enforces Clerk JWT authentication and Owner-only workspace role.
 * 2. Forwards requests to `services/analytics` via `IAnalyticsClient`.
 * 3. Exposes Swagger docs for API consumers.
 *
 * Route: `GET /workspaces/:workspaceId/analytics` — workspace engagement summary.
 */
@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, WorkspaceRolesGuard)
@Roles('owner')
@Controller('workspaces/:workspaceId')
export class AnalyticsController {
  /** @param analyticsClient - Transport-agnostic client for the analytics service. */
  constructor(private readonly analyticsClient: IAnalyticsClient) {}

  /**
   * Returns aggregate engagement metrics for all published posts in a workspace.
   *
   * Proxies to `services/analytics GET /workspaces/:workspaceId/metrics`.
   * Returns zeros for all fields when no posts have been published yet.
   *
   * @param workspaceId - UUID of the workspace (from URL; also read by the auth guard).
   * @returns `{ reach, impressions, likes, comments, shares }` summed across all posts.
   */
  @Get('analytics')
  @ApiOperation({ summary: 'Aggregate engagement metrics for a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiOkResponse({ type: MetricsSummaryDto, description: 'Summed reach, impressions, likes, comments, shares.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Clerk JWT.' })
  @ApiForbiddenResponse({ description: 'User is not an Owner of this workspace.' })
  @ApiServiceUnavailableResponse({ description: 'Analytics service is unreachable.' })
  async getWorkspaceAnalytics(
    @Param('workspaceId') workspaceId: string,
  ): Promise<MetricsSummaryDto> {
    try {
      return await this.analyticsClient.getWorkspaceMetrics(workspaceId);
    } catch (e) {
      throw toHttpException(mapDownstreamError(e));
    }
  }
}
