import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Exposes a liveness probe endpoint for load balancers and orchestration platforms.
 * No authentication is required — this endpoint must remain publicly reachable.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  /**
   * Returns a static `{ status: 'ok' }` payload to confirm the process is running.
   * Kubernetes liveness probes and AWS ALB health checks use this endpoint.
   *
   * @returns Object with a `status` field set to `'ok'`.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
