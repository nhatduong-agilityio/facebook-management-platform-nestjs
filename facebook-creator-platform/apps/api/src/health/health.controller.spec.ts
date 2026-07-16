import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  MikroOrmHealthIndicator,
} from '@nestjs/terminus';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { RedisHealthIndicator } from './indicators/redis.health-indicator';

const healthyResult: HealthCheckResult = {
  status: 'ok',
  info: { postgres: { status: 'up' }, redis: { status: 'up' }, memory_heap: { status: 'up' } },
  error: {},
  details: { postgres: { status: 'up' }, redis: { status: 'up' }, memory_heap: { status: 'up' } },
};

const mockHealth = { check: vi.fn() } as unknown as HealthCheckService;
const mockMemory = { checkHeap: vi.fn() } as unknown as MemoryHealthIndicator;
const mockMikroOrm = { pingCheck: vi.fn() } as unknown as MikroOrmHealthIndicator;
const mockRedis = { isHealthy: vi.fn() } as unknown as RedisHealthIndicator;

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController(mockHealth, mockMemory, mockMikroOrm, mockRedis);
    vi.clearAllMocks();
  });

  it('returns the combined health result when all probes pass', async () => {
    vi.mocked(mockHealth.check).mockResolvedValue(healthyResult);

    const result = await controller.check();

    expect(result).toEqual(healthyResult);
    expect(mockHealth.check).toHaveBeenCalledWith([
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('delegates postgres probe to MikroOrmHealthIndicator.pingCheck', async () => {
    vi.mocked(mockHealth.check).mockImplementation(async (indicators) => {
      await indicators[0]!();
      return healthyResult;
    });
    vi.mocked(mockMikroOrm.pingCheck).mockResolvedValue({ postgres: { status: 'up' } });

    await controller.check();

    expect(mockMikroOrm.pingCheck).toHaveBeenCalledWith('postgres');
  });

  it('delegates redis probe to RedisHealthIndicator.isHealthy', async () => {
    vi.mocked(mockHealth.check).mockImplementation(async (indicators) => {
      await indicators[1]!();
      return healthyResult;
    });
    vi.mocked(mockRedis.isHealthy).mockResolvedValue({ redis: { status: 'up' } });

    await controller.check();

    expect(mockRedis.isHealthy).toHaveBeenCalledWith('redis');
  });

  it('delegates memory probe to MemoryHealthIndicator.checkHeap at 300 MB', async () => {
    vi.mocked(mockHealth.check).mockImplementation(async (indicators) => {
      await indicators[2]!();
      return healthyResult;
    });
    vi.mocked(mockMemory.checkHeap).mockResolvedValue({ memory_heap: { status: 'up' } });

    await controller.check();

    expect(mockMemory.checkHeap).toHaveBeenCalledWith('memory_heap', 300 * 1024 * 1024);
  });

  it('propagates ServiceUnavailableException when a probe fails', async () => {
    const error = new ServiceUnavailableException({
      status: 'error',
      error: { postgres: { status: 'down', message: 'Connection refused' } },
      details: { postgres: { status: 'down', message: 'Connection refused' } },
    });
    vi.mocked(mockHealth.check).mockRejectedValue(error);

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
  });
});
