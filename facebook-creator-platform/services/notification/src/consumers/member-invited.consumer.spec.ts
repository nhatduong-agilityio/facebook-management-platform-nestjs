import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { MemberInvitedConsumer, type MemberInvitedPayload } from './member-invited.consumer';

const makeMsg = (overrides: Partial<MemberInvitedPayload> = {}): MemberInvitedPayload => ({
  eventId: 'evt-004',
  workspaceId: 'ws-001',
  invitationId: 'inv-001',
  email: 'test@example.com',
  role: 'editor',
  invitedByUserId: 'owner-001',
  ...overrides,
});

function makeConsumer(opts: { redisSet?: () => Promise<string | null> }) {
  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
  } as unknown as import('ioredis').Redis;

  const logger = {
    log: vi.fn(),
  } as unknown as Logger;

  return { consumer: new MemberInvitedConsumer(redis, logger), redis, logger };
}

describe('MemberInvitedConsumer', () => {
  it('dedup-only: logs and returns without projection action on new event', async () => {
    const { consumer, logger } = makeConsumer({});
    const result = await consumer.onMemberInvited(makeMsg());
    expect(result).toBeUndefined();
    expect(logger.log).toHaveBeenCalled();
  });

  it('skips duplicate event', async () => {
    const { consumer, logger } = makeConsumer({ redisSet: () => Promise.resolve(null) });
    await consumer.onMemberInvited(makeMsg());
    const logCalls = (logger.log as ReturnType<typeof vi.fn>).mock.calls;
    expect(logCalls.some((c) => String(c[1]).includes('duplicate'))).toBe(true);
  });
});
