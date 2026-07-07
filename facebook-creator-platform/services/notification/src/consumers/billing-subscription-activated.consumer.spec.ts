import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
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
  notifyWorkspace?: () => Promise<void>;
}) {
  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(() => Promise.resolve(1)),
  } as unknown as import('ioredis').Redis;

  const orchestrator = {
    notifyWorkspace: vi.fn(opts.notifyWorkspace ?? (() => Promise.resolve())),
  } as unknown as NotificationOrchestrator;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  const orm = { em: {} } as unknown as MikroORM;
  return { consumer: new BillingSubscriptionActivatedConsumer(orm, orchestrator, redis, logger), orchestrator };
}

describe('BillingSubscriptionActivatedConsumer', () => {
  it('calls notifyWorkspace without Slack on new event', async () => {
    const { consumer, orchestrator } = makeConsumer({});
    await consumer.onSubscriptionActivated(makeMsg());
    expect(orchestrator.notifyWorkspace).toHaveBeenCalledWith(
      'ws-001',
      'billing.subscription_activated',
      expect.any(String),
      expect.stringContaining('pro'),
      expect.objectContaining({ planCode: 'pro' }),
      false, // no Slack
    );
  });

  it('skips duplicate event', async () => {
    const { consumer, orchestrator } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onSubscriptionActivated(makeMsg());
    expect(orchestrator.notifyWorkspace).not.toHaveBeenCalled();
  });
});
