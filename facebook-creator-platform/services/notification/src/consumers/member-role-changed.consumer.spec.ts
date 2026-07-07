import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { MemberRoleChangedConsumer, type MemberRoleChangedPayload } from './member-role-changed.consumer';
import { INotificationRepository } from '../ports/notification.repository.port';

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

  return { consumer: new MemberRoleChangedConsumer(repo, redis, logger), redis, repo, logger };
}

describe('MemberRoleChangedConsumer', () => {
  it('upserts projection with newRole on new event', async () => {
    const { consumer, repo } = makeConsumer({});
    await consumer.onMemberRoleChanged(makeMsg());
    expect(repo.upsertProjectionMember).toHaveBeenCalledWith('ws-001', 'user-001', 'viewer');
  });

  it('skips duplicate event', async () => {
    const { consumer, repo } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onMemberRoleChanged(makeMsg());
    expect(repo.upsertProjectionMember).not.toHaveBeenCalled();
  });

  it('deletes dedup key and rethrows on upsert failure', async () => {
    const { consumer, redis } = makeConsumer({
      upsert: () => Promise.reject(new Error('db error')),
    });
    await expect(consumer.onMemberRoleChanged(makeMsg())).rejects.toThrow('db error');
    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-003');
  });
});
