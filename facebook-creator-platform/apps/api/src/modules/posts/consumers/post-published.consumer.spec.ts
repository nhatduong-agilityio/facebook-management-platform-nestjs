import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { Logger } from 'nestjs-pino';
import type { RmqContext } from '@nestjs/microservices';
import { PostPublishedConsumer, type PostPublishedPayload } from './post-published.consumer';

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

const sampleData: PostPublishedPayload = {
  eventId: 'evt-pub-001',
  routingKey: 'posts.published',
  occurredAt: new Date().toISOString(),
  postId: 'post-abc',
  workspaceId: 'ws-xyz',
  facebookGraphPostId: 'page-1_post-2',
};

describe('PostPublishedConsumer', () => {
  let consumer: PostPublishedConsumer;

  beforeEach(() => {
    consumer = new PostPublishedConsumer(mockRedis, mockLogger);
    vi.clearAllMocks();
  });

  it('acks without logging when the event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null);

    await consumer.onPostPublished(sampleData, mockCtx);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it('logs the event and acks on first delivery (new event)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    await consumer.onPostPublished(sampleData, mockCtx);

    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockLogger.log).toHaveBeenCalledWith(
      { postId: 'post-abc', workspaceId: 'ws-xyz' },
      'PostPublishedConsumer: received posts.published',
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('sets the dedup key with correct key pattern and TTL', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    await consumer.onPostPublished(sampleData, mockCtx);

    expect(mockRedis.set).toHaveBeenCalledWith('dedup:evt-pub-001', '1', 'EX', 86400, 'NX');
  });

  it('deletes the dedup key and nacks with requeue on a transient error', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const transientError = new Error('logger down');
    vi.mocked(mockLogger.log).mockImplementationOnce(() => {
      throw transientError;
    });

    await consumer.onPostPublished(sampleData, mockCtx);

    expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-pub-001');
    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
  });
});
