import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { MikroORM } from '@mikro-orm/core';
import type { Logger } from 'nestjs-pino';
import { FacebookPageDeauthorizedConsumer, type FacebookDeauthorizedPayload } from './facebook-deauthorized.consumer';
import type { FacebookAccount } from '../entities/facebook-account.entity';

const mockRedis = {
  set: vi.fn<Parameters<Redis['set']>>(),
  del: vi.fn<Parameters<Redis['del']>>().mockResolvedValue(1),
} as unknown as Redis;

const mockTx = {
  nativeUpdate: vi.fn().mockResolvedValue(1),
};

const mockEm = {
  findOne: vi.fn(),
  transactional: vi.fn<Parameters<ReturnType<MikroORM['em']['fork']>['transactional']>>(),
};

const mockOrm = {
  em: { fork: vi.fn().mockReturnValue(mockEm) },
} as unknown as MikroORM;

const mockLogger = { log: vi.fn() } as unknown as Logger;

const sampleMsg: FacebookDeauthorizedPayload = {
  eventId: 'evt-deauth-001',
  pageId: 'page-999',
  occurredAt: new Date().toISOString(),
};

describe('FacebookPageDeauthorizedConsumer', () => {
  let consumer: FacebookPageDeauthorizedConsumer;

  beforeEach(() => {
    consumer = new FacebookPageDeauthorizedConsumer(mockRedis, mockOrm, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockOrm.em.fork).mockReturnValue(mockEm as never);
    vi.mocked(mockEm.transactional).mockImplementation(async (fn) => fn(mockTx as never));
  });

  it('returns early when event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null);

    await consumer.onPageDeauthorized(sampleMsg);

    expect(mockEm.findOne).not.toHaveBeenCalled();
  });

  it('skips silently when no active account is found for the pageId', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockEm.findOne).mockResolvedValue(null);

    await consumer.onPageDeauthorized(sampleMsg);

    expect(mockEm.transactional).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledOnce();
  });

  it('soft-deletes the account and bulk-cancels posts in a transaction on the happy path', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const fakeAccount = {
      id: 'acc-uuid-1',
      pageId: 'page-999',
      deletedAt: undefined as Date | undefined,
    } as unknown as FacebookAccount;
    vi.mocked(mockEm.findOne).mockResolvedValue(fakeAccount);

    await consumer.onPageDeauthorized(sampleMsg);

    expect(mockEm.transactional).toHaveBeenCalledOnce();
    expect(fakeAccount.deletedAt).toBeInstanceOf(Date);
    expect(mockTx.nativeUpdate).toHaveBeenCalledOnce();
    const [, filter, update] = vi.mocked(mockTx.nativeUpdate).mock.calls[0];
    expect((filter as Record<string, unknown>)['facebookAccount']).toBe('acc-uuid-1');
    expect((update as Record<string, unknown>)['status']).toBe('failed');
    expect(mockLogger.log).toHaveBeenCalledOnce();
  });

  it('clears dedup key and rethrows on a transient error', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockEm.findOne).mockRejectedValue(new Error('DB timeout'));

    await expect(consumer.onPageDeauthorized(sampleMsg)).rejects.toThrow('DB timeout');
    expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-deauth-001');
  });
});
