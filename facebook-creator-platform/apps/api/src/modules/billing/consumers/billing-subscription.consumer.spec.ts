import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { Logger } from 'nestjs-pino';
import type { RmqContext } from '@nestjs/microservices';
import type { SubscriptionActivatedPayload, SubscriptionCancelledPayload } from '@fcp/billing-contracts';
import { BillingSubscriptionConsumer } from './billing-subscription.consumer';

const mockRedis = {
  set: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as unknown as Redis;

const mockLogger = {
  log: vi.fn(),
} as unknown as Logger;

const mockChannel = { ack: vi.fn(), nack: vi.fn() };
const mockMsg = {};
const mockCtx = {
  getChannelRef: () => mockChannel,
  getMessage: () => mockMsg,
} as unknown as RmqContext;

const activatedData: SubscriptionActivatedPayload = {
  eventId: 'evt-act-001',
  workspaceId: 'ws-001',
  planCode: 'pro',
  stripeSubscriptionId: 'sub_001',
  occurredAt: new Date().toISOString(),
} as SubscriptionActivatedPayload;

const cancelledData: SubscriptionCancelledPayload = {
  eventId: 'evt-can-001',
  workspaceId: 'ws-001',
  planCode: 'pro',
  stripeSubscriptionId: 'sub_001',
  occurredAt: new Date().toISOString(),
} as SubscriptionCancelledPayload;

describe('BillingSubscriptionConsumer', () => {
  let consumer: BillingSubscriptionConsumer;

  beforeEach(() => {
    consumer = new BillingSubscriptionConsumer(mockRedis, mockLogger);
    vi.clearAllMocks();
  });

  describe('onSubscriptionActivated', () => {
    it('acks without logging on duplicate delivery', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue(null);

      await consumer.onSubscriptionActivated(activatedData, mockCtx);

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('logs and acks on first delivery', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue('OK');

      await consumer.onSubscriptionActivated(activatedData, mockCtx);

      expect(mockLogger.log).toHaveBeenCalledOnce();
      expect(mockLogger.log).toHaveBeenCalledWith(
        { workspaceId: 'ws-001', planCode: 'pro' },
        'BillingSubscriptionConsumer: subscription activated',
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('nacks with requeue and clears dedup key on transient error', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue('OK');
      vi.mocked(mockLogger.log).mockImplementationOnce(() => {
        throw new Error('transient');
      });

      await consumer.onSubscriptionActivated(activatedData, mockCtx);

      expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-act-001');
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    });
  });

  describe('onSubscriptionCancelled', () => {
    it('acks without logging on duplicate delivery', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue(null);

      await consumer.onSubscriptionCancelled(cancelledData, mockCtx);

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('logs and acks on first delivery', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue('OK');

      await consumer.onSubscriptionCancelled(cancelledData, mockCtx);

      expect(mockLogger.log).toHaveBeenCalledOnce();
      expect(mockLogger.log).toHaveBeenCalledWith(
        { workspaceId: 'ws-001', planCode: 'pro' },
        'BillingSubscriptionConsumer: subscription cancelled',
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('nacks with requeue and clears dedup key on transient error', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue('OK');
      vi.mocked(mockLogger.log).mockImplementationOnce(() => {
        throw new Error('transient');
      });

      await consumer.onSubscriptionCancelled(cancelledData, mockCtx);

      expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-can-001');
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    });
  });
});
