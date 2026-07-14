import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { RmqContext } from '@nestjs/microservices';
import { BillingSubscriptionActivatedConsumer } from './billing-subscription-activated.consumer';
import { NotificationOrchestrator } from '../notification-orchestrator';
import type { SubscriptionActivatedPayload } from '@fcp/billing-contracts';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<SubscriptionActivatedPayload> = {}): SubscriptionActivatedPayload => ({
  eventId: 'evt-ba1',
  workspaceId: 'ws-001',
  planCode: 'pro',
  occurredAt: '2026-07-07T00:00:00Z',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  notifyWorkspace?: () => Promise<void>;
}) {
  const mockChannel = { ack: vi.fn(), nack: vi.fn() };
  const mockMsg = {};
  const mockCtx = {
    getChannelRef: () => mockChannel,
    getMessage: () => mockMsg,
  } as unknown as RmqContext;

  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(opts.redisDel ?? (() => Promise.resolve(1))),
  } as unknown as import('ioredis').Redis;

  const orchestrator = {
    notifyWorkspace: vi.fn(opts.notifyWorkspace ?? (() => Promise.resolve())),
  } as unknown as NotificationOrchestrator;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  const orm = { em: {} } as unknown as MikroORM;
  return { consumer: new BillingSubscriptionActivatedConsumer(orm, orchestrator, redis, logger), redis, orchestrator, mockChannel, mockMsg, mockCtx };
}

describe('BillingSubscriptionActivatedConsumer', () => {
  it('calls notifyWorkspace without Slack and acks on new event', async () => {
    const { consumer, orchestrator, mockChannel, mockMsg, mockCtx } = makeConsumer({});

    await consumer.onSubscriptionActivated(makeMsg(), mockCtx);

    expect(orchestrator.notifyWorkspace).toHaveBeenCalledWith(
      'ws-001',
      'billing.subscription_activated',
      expect.any(String),
      expect.stringContaining('pro'),
      expect.objectContaining({ planCode: 'pro' }),
      false,
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('acks and skips notifyWorkspace on duplicate event', async () => {
    const { consumer, orchestrator, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.resolve(null),
    });

    await consumer.onSubscriptionActivated(makeMsg(), mockCtx);

    expect(orchestrator.notifyWorkspace).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('clears dedup key and nacks with requeue on failure', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      notifyWorkspace: () => Promise.reject(new Error('orchestrator error')),
    });

    await consumer.onSubscriptionActivated(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-ba1');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
