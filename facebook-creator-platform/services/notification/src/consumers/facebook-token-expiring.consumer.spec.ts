import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { FacebookTokenExpiringConsumer, type FacebookTokenExpiringPayload } from './facebook-token-expiring.consumer';
import { NotificationOrchestrator } from '../notification-orchestrator';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<FacebookTokenExpiringPayload> = {}): FacebookTokenExpiringPayload => ({
  eventId: 'evt-ft1',
  accountId: 'acct-001',
  workspaceId: 'ws-001',
  pageId: 'page-123',
  tokenExpiresAt: '2026-07-14T00:00:00Z',
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
  return { consumer: new FacebookTokenExpiringConsumer(orm, orchestrator, redis, logger), orchestrator };
}

describe('FacebookTokenExpiringConsumer', () => {
  it('calls notifyWorkspace without Slack on new event', async () => {
    const { consumer, orchestrator } = makeConsumer({});
    await consumer.onTokenExpiring(makeMsg());
    expect(orchestrator.notifyWorkspace).toHaveBeenCalledWith(
      'ws-001',
      'facebook.token_expiring',
      expect.any(String),
      expect.stringContaining('reconnect'),
      expect.objectContaining({ accountId: 'acct-001' }),
      false, // no Slack
    );
  });

  it('skips duplicate event', async () => {
    const { consumer, orchestrator } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onTokenExpiring(makeMsg());
    expect(orchestrator.notifyWorkspace).not.toHaveBeenCalled();
  });
});
