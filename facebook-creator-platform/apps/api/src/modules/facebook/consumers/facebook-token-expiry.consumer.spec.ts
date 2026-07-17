import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import type { Redis } from 'ioredis';
import type { Logger } from 'nestjs-pino';
import type { RmqContext } from '@nestjs/microservices';
import { AppError } from '../../../common/errors/app-error';
import { FacebookTokenExpiryConsumer, type FacebookTokenExpiringPayload } from './facebook-token-expiry.consumer';
import type { FacebookService } from '../facebook.service';

const mockRedis = {
  set: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as unknown as Redis;

const mockFacebookService = {
  refreshAccountToken: vi.fn(),
} as unknown as FacebookService;

const mockLogger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;

const mockChannel = { ack: vi.fn(), nack: vi.fn() };
const mockMsg = {};
const mockCtx = {
  getChannelRef: () => mockChannel,
  getMessage: () => mockMsg,
} as unknown as RmqContext;

const sampleData: FacebookTokenExpiringPayload = {
  eventId: 'evt-token-001',
  accountId: 'acc-uuid-1',
  workspaceId: 'ws-uuid-1',
  pageId: 'page-111',
  tokenExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
  traceId: 'trace-abc',
};

describe('FacebookTokenExpiryConsumer', () => {
  let consumer: FacebookTokenExpiryConsumer;

  beforeEach(() => {
    consumer = new FacebookTokenExpiryConsumer(mockRedis, mockFacebookService, mockLogger);
    vi.clearAllMocks();
  });

  it('acks immediately when the event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null);

    await consumer.onTokenExpiring(sampleData, mockCtx);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockFacebookService.refreshAccountToken).not.toHaveBeenCalled();
  });

  it('refreshes the token and acks on the happy path', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockFacebookService.refreshAccountToken).mockResolvedValue(ok(undefined));

    await consumer.onTokenExpiring(sampleData, mockCtx);

    expect(mockFacebookService.refreshAccountToken).toHaveBeenCalledWith(
      sampleData.workspaceId,
      sampleData.accountId,
    );
    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('permanent-nacks (no requeue) when account is NOT_FOUND', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockFacebookService.refreshAccountToken).mockResolvedValue(
      err(AppError.notFound('FacebookAccount', { accountId: sampleData.accountId })),
    );

    await consumer.onTokenExpiring(sampleData, mockCtx);

    expect(mockLogger.warn).toHaveBeenCalledOnce();
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('clears dedup key and nacks with requeue on a transient error from refreshAccountToken', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockFacebookService.refreshAccountToken).mockRejectedValue(
      new Error('Graph API timeout'),
    );

    await consumer.onTokenExpiring(sampleData, mockCtx);

    expect(mockRedis.del).toHaveBeenCalledWith(`dedup:${sampleData.eventId}`);
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('clears dedup key and nacks with requeue when refreshAccountToken returns an unexpected err', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    vi.mocked(mockFacebookService.refreshAccountToken).mockResolvedValue(
      err(AppError.internal('Unexpected encryption failure')),
    );

    await consumer.onTokenExpiring(sampleData, mockCtx);

    expect(mockRedis.del).toHaveBeenCalledWith(`dedup:${sampleData.eventId}`);
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
