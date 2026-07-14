import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { RmqContext } from '@nestjs/microservices';
import { MemberRemovedConsumer, type MemberRemovedPayload } from './member-removed.consumer';
import { INotificationRepository } from '../ports/notification.repository.port';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<MemberRemovedPayload> = {}): MemberRemovedPayload => ({
  eventId: 'evt-002',
  workspaceId: 'ws-001',
  removedUserId: 'user-001',
  removedByUserId: 'owner-001',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  remove?: () => Promise<void>;
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

  const repo = {
    removeProjectionMember: vi.fn(opts.remove ?? (() => Promise.resolve())),
  } as unknown as INotificationRepository;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  const orm = { em: {} } as unknown as MikroORM;
  return { consumer: new MemberRemovedConsumer(orm, repo, redis, logger), redis, repo, mockChannel, mockMsg, mockCtx };
}

describe('MemberRemovedConsumer', () => {
  it('removes projection row and acks on new event', async () => {
    const { consumer, repo, mockChannel, mockMsg, mockCtx } = makeConsumer({});

    await consumer.onMemberRemoved(makeMsg(), mockCtx);

    expect(repo.removeProjectionMember).toHaveBeenCalledWith('ws-001', 'user-001');
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('acks and skips remove on duplicate event', async () => {
    const { consumer, repo, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.resolve(null),
    });

    await consumer.onMemberRemoved(makeMsg(), mockCtx);

    expect(repo.removeProjectionMember).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('clears dedup key and nacks with requeue on remove failure', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      remove: () => Promise.reject(new Error('db error')),
    });

    await consumer.onMemberRemoved(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-002');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
