import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

/**
 * Registers the readiness probe endpoint (`GET /api/v1/health`).
 *
 * Imports `TerminusModule` which auto-provides `HealthCheckService`,
 * `HealthIndicatorService`, `MikroOrmHealthIndicator`, and `MemoryHealthIndicator`.
 * `RedisHealthIndicator` is a custom provider for the IOREDIS-based ping.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
