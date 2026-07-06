import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { Logger } from 'nestjs-pino';
import { FacebookTokenExpiryScheduler } from './facebook-token-expiry.job';
import type { IEventBus } from '../../../common/events/event-bus.port';
import type { FacebookAccount } from '../entities/facebook-account.entity';
import { FacebookTokenExpiringEvent } from '../events/facebook-token-expiring.event';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAccount(overrides: Partial<FacebookAccount> = {}): FacebookAccount {
  return {
    id: 'acc-1',
    pageId: 'page-111',
    workspace: { id: 'ws-1' } as FacebookAccount['workspace'],
    tokenExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    deletedAt: undefined,
    ...overrides,
  } as unknown as FacebookAccount;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEm = {
  find: vi.fn(),
};

const mockOrm = {
  em: { fork: vi.fn().mockReturnValue(mockEm) },
} as unknown as MikroORM;

const mockEventBus: IEventBus = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as IEventBus;

const mockLogger = {
  log: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacebookTokenExpiryScheduler', () => {
  let scheduler: FacebookTokenExpiryScheduler;

  beforeEach(() => {
    scheduler = new FacebookTokenExpiryScheduler(mockOrm, mockEventBus, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockOrm.em.fork).mockReturnValue(mockEm as never);
  });

  it('does not emit any events when no accounts have expiring tokens', async () => {
    vi.mocked(mockEm.find).mockResolvedValue([]);

    await scheduler.run();

    expect(mockEventBus.publish).not.toHaveBeenCalled();
  });

  it('emits one FacebookTokenExpiringEvent per near-expiry account', async () => {
    const acc1 = makeAccount({ id: 'acc-1', pageId: 'page-111' });
    const acc2 = makeAccount({
      id: 'acc-2',
      pageId: 'page-222',
      workspace: { id: 'ws-2' } as FacebookAccount['workspace'],
    });
    vi.mocked(mockEm.find).mockResolvedValue([acc1, acc2]);

    await scheduler.run();

    expect(mockEventBus.publish).toHaveBeenCalledTimes(2);

    const [call1, call2] = vi.mocked(mockEventBus.publish).mock.calls;
    const evt1 = call1[0] as FacebookTokenExpiringEvent;
    const evt2 = call2[0] as FacebookTokenExpiringEvent;

    expect(evt1).toBeInstanceOf(FacebookTokenExpiringEvent);
    expect(evt1.accountId).toBe('acc-1');
    expect(evt1.workspaceId).toBe('ws-1');
    expect(evt1.pageId).toBe('page-111');
    expect(evt1.tokenExpiresAt).toBeInstanceOf(Date);

    expect(evt2).toBeInstanceOf(FacebookTokenExpiringEvent);
    expect(evt2.accountId).toBe('acc-2');
    expect(evt2.workspaceId).toBe('ws-2');
  });

  it('emits events with no access token in the payload (BR-F11)', async () => {
    const acc = makeAccount();
    vi.mocked(mockEm.find).mockResolvedValue([acc]);

    await scheduler.run();

    const event = vi.mocked(mockEventBus.publish).mock.calls[0][0] as FacebookTokenExpiringEvent;
    expect((event as unknown as Record<string, unknown>)['accessToken']).toBeUndefined();
    expect((event as unknown as Record<string, unknown>)['token']).toBeUndefined();
  });
});
