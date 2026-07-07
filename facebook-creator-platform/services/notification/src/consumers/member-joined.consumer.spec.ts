import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { MemberJoinedConsumer, type MemberJoinedPayload } from './member-joined.consumer';
import { INotificationRepository } from '../ports/notification.repository.port';

const makeMsg = (overrides: Partial<MemberJoinedPayload> = {}): MemberJoinedPayload => ({
  eventId: 'evt-001',
  workspaceId: 'ws-001',
  userId: 'user-001',
  role: 'editor',
  invitationId: 'inv-001',
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

  return { consumer: new MemberJoinedConsumer(repo, redis, logger), redis, repo, logger };
}

describe('MemberJoinedConsumer', () => {
  it('upserts projection on new event', async () => {
    const { consumer, repo } = makeConsumer({});
    await consumer.onMemberJoined(makeMsg());
    expect(repo.upsertProjectionMember).toHaveBeenCalledWith('ws-001', 'user-001', 'editor');
  });

  it('skips duplicate event (redis NX returns null)', async () => {
    const { consumer, repo } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onMemberJoined(makeMsg());
    expect(repo.upsertProjectionMember).not.toHaveBeenCalled();
  });

  it('deletes dedup key and rethrows on upsert failure', async () => {
    const { consumer, redis } = makeConsumer({
      upsert: () => Promise.reject(new Error('db error')),
    });
    await expect(consumer.onMemberJoined(makeMsg())).rejects.toThrow('db error');
    expect(redis.del).toHaveBeenCalledWith('dedup:notification:evt-001');
  });
});
