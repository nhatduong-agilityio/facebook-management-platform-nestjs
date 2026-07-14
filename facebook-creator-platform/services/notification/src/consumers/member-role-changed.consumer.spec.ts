import { describe, it, expect, vi } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { RmqContext } from '@nestjs/microservices';
import { MemberRoleChangedConsumer, type MemberRoleChangedPayload } from './member-role-changed.consumer';
import { INotificationRepository } from '../ports/notification.repository.port';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<MemberRoleChangedPayload> = {}): MemberRoleChangedPayload => ({
  eventId: 'evt-003',
  workspaceId: 'ws-001',
  userId: 'user-001',
  oldRole: 'editor',
  newRole: 'viewer',
  changedByUserId: 'owner-001',
  ...overrides,
});

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
  redisDel?: () => Promise<number>;
  upsert?: () => Promise<void>;
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
    upsertProjectionMember: vi.fn(opts.upsert ?? (() => Promise.resolve())),
  } as unknown as INotificationRepository;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  const orm = { em: {} } as unknown as MikroORM;
  return { consumer: new MemberRoleChangedConsumer(orm, repo, redis, logger), redis, repo, mockChannel, mockMsg, mockCtx };
}

describe('MemberRoleChangedConsumer', () => {
  it('upserts projection with newRole and acks on new event', async () => {
    const { consumer, repo, mockChannel, mockMsg, mockCtx } = makeConsumer({});

    await consumer.onMemberRoleChanged(makeMsg(), mockCtx);

    expect(repo.upsertProjectionMember).toHaveBeenCalledWith('ws-001', 'user-001', 'viewer');
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('acks and skips upsert on duplicate event', async () => {
    const { consumer, repo, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.resolve(null),
    });

    await consumer.onMemberRoleChanged(makeMsg(), mockCtx);

    expect(repo.upsertProjectionMember).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('clears dedup key and nacks with requeue on upsert failure', async () => {
    const { consumer, redis, mockChannel, mockMsg, mockCtx } = makeConsumer({
      upsert: () => Promise.reject(new Error('db error')),
    });

    await consumer.onMemberRoleChanged(makeMsg(), mockCtx);

    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-003');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
