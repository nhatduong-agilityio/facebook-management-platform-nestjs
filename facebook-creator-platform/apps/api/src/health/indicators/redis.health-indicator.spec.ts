import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { HealthIndicatorService } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health-indicator';

const upResult = { redis: { status: 'up' } };
const downResult = { redis: { status: 'down', message: 'Connection refused' } };

const mockIndicatorSession = {
  up: vi.fn().mockReturnValue(upResult),
  down: vi.fn().mockReturnValue(downResult),
};

const mockHealthIndicatorService = {
  check: vi.fn().mockReturnValue(mockIndicatorSession),
} as unknown as HealthIndicatorService;

const mockRedis = {
  ping: vi.fn(),
} as unknown as Redis;

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    indicator = new RedisHealthIndicator(mockRedis, mockHealthIndicatorService);
    vi.clearAllMocks();
    vi.mocked(mockHealthIndicatorService.check).mockReturnValue(mockIndicatorSession as never);
    vi.mocked(mockIndicatorSession.up).mockReturnValue(upResult as never);
    vi.mocked(mockIndicatorSession.down).mockReturnValue(downResult as never);
  });

  it('returns up result when PING responds with PONG', async () => {
    vi.mocked(mockRedis.ping).mockResolvedValue('PONG');

    const result = await indicator.isHealthy('redis');

    expect(mockHealthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(mockIndicatorSession.up).toHaveBeenCalledOnce();
    expect(result).toEqual(upResult);
  });

  it('returns down result when PING responds with an unexpected value', async () => {
    vi.mocked(mockRedis.ping).mockResolvedValue('PONG' as never);
    // Override to return non-PONG
    vi.mocked(mockRedis.ping).mockResolvedValue('ERR' as never);

    const result = await indicator.isHealthy('redis');

    expect(mockIndicatorSession.down).toHaveBeenCalledWith({
      message: 'Unexpected PING response: ERR',
    });
    expect(result).toEqual(downResult);
  });

  it('returns down result when redis.ping() throws', async () => {
    vi.mocked(mockRedis.ping).mockRejectedValue(new Error('Connection refused'));

    const result = await indicator.isHealthy('redis');

    expect(mockIndicatorSession.down).toHaveBeenCalledWith({ message: 'Connection refused' });
    expect(result).toEqual(downResult);
  });
});
