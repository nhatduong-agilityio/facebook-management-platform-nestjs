import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Registers the liveness probe endpoint (`GET /api/v1/health`).
 * No services or providers are needed — the response is static.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
