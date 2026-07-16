import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  MikroOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

/**
 * Exposes a readiness probe endpoint for load balancers and orchestration platforms.
 *
 * Probes three dependencies on each request:
 * - **Postgres** via `MikroOrmHealthIndicator.pingCheck` — verifies the DB connection is alive.
 * - **Redis** via `RedisHealthIndicator.isHealthy` — asserts `PING` returns `PONG`.
 * - **Heap memory** via `MemoryHealthIndicator.checkHeap` — fails if heap exceeds 300 MB.
 *
 * Returns HTTP 200 with `{ status: 'ok', details: {...} }` when all probes pass.
 * Returns HTTP 503 with `{ status: 'error', details: {...} }` when any probe fails,
 * so container orchestrators can remove the instance from the rotation.
 *
 * No authentication is required — this endpoint must remain publicly reachable.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly mikroOrm: MikroOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Runs all dependency probes and returns a combined health-check result.
   *
   * Kubernetes readiness probes and AWS ALB health checks use this endpoint.
   * The response shape `{ status, info, error, details }` is a superset of the
   * previous `{ status }` payload, so existing callers remain compatible.
   *
   * @returns Combined `HealthCheckResult` — HTTP 200 on healthy, HTTP 503 on unhealthy.
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — Postgres, Redis, and heap checks' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.mikroOrm.pingCheck('postgres'),
      () => this.redis.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}
