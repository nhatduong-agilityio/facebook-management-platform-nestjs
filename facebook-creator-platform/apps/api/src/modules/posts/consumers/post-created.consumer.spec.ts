import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { Logger } from 'nestjs-pino';
import type { RmqContext } from '@nestjs/microservices';
import { PostCreatedConsumer, type PostCreatedPayload } from './post-created.consumer';

const mockRedis = {
  set: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as unknown as Redis;

const mockLogger = {
  log: vi.fn(),
} as unknown as Logger;

const mockChannel = { ack: vi.fn(), nack: vi.fn() };
const mockMsg = {};
const mockCtx = {
  getChannelRef: () => mockChannel,
  getMessage: () => mockMsg,
} as unknown as RmqContext;

const sampleData: PostCreatedPayload = {
  eventId: 'evt-001',
  routingKey: 'posts.created',
  occurredAt: new Date().toISOString(),
  postId: 'post-abc',
  workspaceId: 'ws-xyz',
  createdByUserId: 'user-111',
  traceId: 'trace-abc',
};

describe('PostCreatedConsumer', () => {
  let consumer: PostCreatedConsumer;

  beforeEach(() => {
    consumer = new PostCreatedConsumer(mockRedis, mockLogger);
    vi.clearAllMocks();
  });

  it('acks without logging when the event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null); // NX condition failed — key exists

    await consumer.onPostCreated(sampleData, mockCtx);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it('logs the event and acks on first delivery (new event)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK'); // NX condition met — key was set

    await consumer.onPostCreated(sampleData, mockCtx);

    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockLogger.log).toHaveBeenCalledWith(
      { postId: 'post-abc', workspaceId: 'ws-xyz', traceId: 'trace-abc' },
      'PostCreatedConsumer: received posts.created',
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('sets the dedup key with correct key pattern and TTL', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    await consumer.onPostCreated(sampleData, mockCtx);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'dedup:evt-001',
      '1',
      'EX',
      86400,
      'NX',
    );
  });

  it('deletes the dedup key and nacks with requeue on a transient error', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const transientError = new Error('logger down');
    vi.mocked(mockLogger.log).mockImplementationOnce(() => {
      throw transientError;
    });

    await consumer.onPostCreated(sampleData, mockCtx);

    expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-001');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
