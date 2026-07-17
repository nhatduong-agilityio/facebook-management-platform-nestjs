import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { MikroORM } from '@mikro-orm/core';
import type { Logger } from 'nestjs-pino';
import type { RmqContext } from '@nestjs/microservices';
import { FacebookPageDeauthorizedConsumer, type FacebookDeauthorizedPayload } from './facebook-deauthorized.consumer';
import type { FacebookAccount } from '../entities/facebook-account.entity';

const mockRedis = {
  set: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as unknown as Redis;

const mockTx = {
  nativeUpdate: vi.fn().mockResolvedValue(1),
};

const mockEm = {
  findOne: vi.fn(),
  transactional: vi.fn(),
};

const mockOrm = {
  em: { fork: vi.fn().mockReturnValue(mockEm) },
} as unknown as MikroORM;

const mockLogger = { log: vi.fn() } as unknown as Logger;

const mockChannel = { ack: vi.fn(), nack: vi.fn() };
const mockMsg = {};
const mockCtx = {
  getChannelRef: () => mockChannel,
  getMessage: () => mockMsg,
} as unknown as RmqContext;

const sampleData: FacebookDeauthorizedPayload = {
  eventId: 'evt-deauth-001',
  pageId: 'page-999',
  occurredAt: new Date().toISOString(),
  traceId: 'trace-abc',
};

describe('FacebookPageDeauthorizedConsumer', () => {
  let consumer: FacebookPageDeauthorizedConsumer;

  beforeEach(() => {
    consumer = new FacebookPageDeauthorizedConsumer(mockRedis, mockOrm, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockOrm.em.fork).mockReturnValue(mockEm as never);
    vi.mocked(mockEm.transactional).mockImplementation(async (fn) => fn(mockTx as never));
  });

  it('acks when event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null);

    await consumer.onPageDeauthorized(sampleData, mockCtx);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockEm.findOne).not.toHaveBeenCalled();
  });

  it('acks and skips silently when no active account is found for the pageId', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockEm.findOne).mockResolvedValue(null);

    await consumer.onPageDeauthorized(sampleData, mockCtx);

    expect(mockEm.transactional).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('soft-deletes the account, bulk-cancels posts in a transaction, and acks on the happy path', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const fakeAccount = {
      id: 'acc-uuid-1',
      pageId: 'page-999',
      deletedAt: undefined as Date | undefined,
    } as unknown as FacebookAccount;
    vi.mocked(mockEm.findOne).mockResolvedValue(fakeAccount);

    await consumer.onPageDeauthorized(sampleData, mockCtx);

    expect(mockEm.transactional).toHaveBeenCalledOnce();
    expect(fakeAccount.deletedAt).toBeInstanceOf(Date);
    expect(mockTx.nativeUpdate).toHaveBeenCalledOnce();
    const [, filter, update] = vi.mocked(mockTx.nativeUpdate).mock.calls[0];
    expect((filter as Record<string, unknown>)['facebookAccount']).toBe('acc-uuid-1');
    expect((update as Record<string, unknown>)['status']).toBe('failed');
    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('clears dedup key and nacks with requeue on a transient error', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockEm.findOne).mockRejectedValue(new Error('DB timeout'));

    await consumer.onPageDeauthorized(sampleData, mockCtx);

    expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-deauth-001');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
