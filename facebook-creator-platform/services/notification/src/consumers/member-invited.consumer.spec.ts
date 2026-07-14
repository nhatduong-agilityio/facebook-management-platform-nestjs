import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { RmqContext } from '@nestjs/microservices';
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

function makeConsumer(opts: {
  redisSet?: () => Promise<string | null>;
}) {
  const mockChannel = { ack: vi.fn(), nack: vi.fn() };
  const mockMsg = {};
  const mockCtx = {
    getChannelRef: () => mockChannel,
    getMessage: () => mockMsg,
  } as unknown as RmqContext;

  const redis = {
    set: vi.fn(opts.redisSet ?? (() => Promise.resolve('OK'))),
  } as unknown as import('ioredis').Redis;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  return { consumer: new MemberInvitedConsumer(redis, logger), redis, logger, mockChannel, mockMsg, mockCtx };
}

describe('MemberInvitedConsumer', () => {
  it('dedup-only: acks and logs on new event', async () => {
    const { consumer, logger, mockChannel, mockMsg, mockCtx } = makeConsumer({});

    await consumer.onMemberInvited(makeMsg(), mockCtx);

    expect(logger.log).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('acks and logs duplicate on duplicate event', async () => {
    const { consumer, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.resolve(null),
    });

    await consumer.onMemberInvited(makeMsg(), mockCtx);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('nacks with requeue when Redis fails', async () => {
    const { consumer, mockChannel, mockMsg, mockCtx } = makeConsumer({
      redisSet: () => Promise.reject(new Error('redis error')),
    });

    await consumer.onMemberInvited(makeMsg(), mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
