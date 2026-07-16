import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';

/**
 * Health indicator that probes Redis via an IOREDIS `PING` command.
 *
 * Returns `{ [key]: { status: 'down', message: '...' } }` on any error or
 * unexpected response — `HealthCheckService` will then return HTTP 503.
 * No exception is thrown for connection failures (expected errors are surfaced
 * via the result's `status: 'down'` field, per the terminus v11 functional API).
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /**
   * Sends `PING` to Redis and asserts the response is `'PONG'`.
   *
   * @param key - Label used in the `details` map of the health response (e.g. `'redis'`).
   * @returns `HealthIndicatorResult` with `{ [key]: { status: 'up' } }` on success,
   *          or `{ [key]: { status: 'down', message: '...' } }` on failure.
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return indicator.down({ message: `Unexpected PING response: ${pong}` });
      }
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
