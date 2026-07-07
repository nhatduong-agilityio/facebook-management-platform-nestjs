import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { MemberRemovedConsumer, type MemberRemovedPayload } from './member-removed.consumer';
import { INotificationRepository } from '../ports/notification.repository.port';

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

  return { consumer: new MemberRemovedConsumer(repo, redis, logger), redis, repo, logger };
}

describe('MemberRemovedConsumer', () => {
  it('removes projection row on new event', async () => {
    const { consumer, repo } = makeConsumer({});
    await consumer.onMemberRemoved(makeMsg());
    expect(repo.removeProjectionMember).toHaveBeenCalledWith('ws-001', 'user-001');
  });

  it('skips duplicate event', async () => {
    const { consumer, repo } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onMemberRemoved(makeMsg());
    expect(repo.removeProjectionMember).not.toHaveBeenCalled();
  });

  it('deletes dedup key and rethrows on remove failure', async () => {
    const { consumer, redis } = makeConsumer({
      remove: () => Promise.reject(new Error('db error')),
    });
    await expect(consumer.onMemberRemoved(makeMsg())).rejects.toThrow('db error');
    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-002');
  });
});
