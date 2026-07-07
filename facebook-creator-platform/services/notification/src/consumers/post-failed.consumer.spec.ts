import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { PostFailedNotificationConsumer, type PostFailedPayload } from './post-failed.consumer';
import { NotificationOrchestrator } from '../notification-orchestrator';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<PostFailedPayload> = {}): PostFailedPayload => ({
  eventId: 'evt-pf1',
  postId: 'post-001',
  workspaceId: 'ws-001',
  createdByUserId: 'user-001',
  occurredAt: '2026-07-07T00:00:00Z',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  notifyUser?: () => Promise<void>;
}) {
  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
    del: vi.fn(opts.redisDel ?? (() => Promise.resolve(1))),
  } as unknown as import('ioredis').Redis;

  const orchestrator = {
    notifyUser: vi.fn(opts.notifyUser ?? (() => Promise.resolve())),
  } as unknown as NotificationOrchestrator;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  const orm = { em: {} } as unknown as MikroORM;
  return { consumer: new PostFailedNotificationConsumer(orm, orchestrator, redis, logger), redis, orchestrator };
}

describe('PostFailedNotificationConsumer', () => {
  it('calls notifyUser (not notifyWorkspace) on new event', async () => {
    const { consumer, orchestrator } = makeConsumer({});
    await consumer.onPostFailed(makeMsg());
    expect(orchestrator.notifyUser).toHaveBeenCalledWith(
      'user-001',
      'ws-001',
      'posts.failed',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ postId: 'post-001' }),
      true,
    );
  });

  it('skips duplicate event', async () => {
    const { consumer, orchestrator } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onPostFailed(makeMsg());
    expect(orchestrator.notifyUser).not.toHaveBeenCalled();
  });

  it('deletes dedup key and rethrows on failure', async () => {
    const { consumer, redis } = makeConsumer({
      notifyUser: () => Promise.reject(new Error('orchestrator error')),
    });
    await expect(consumer.onPostFailed(makeMsg())).rejects.toThrow('orchestrator error');
    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-pf1');
  });
});
