import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { Logger } from 'nestjs-pino';
import { PostCreatedConsumer, type PostCreatedPayload } from './post-created.consumer';

const mockRedis = {
  set: vi.fn<Parameters<Redis['set']>>(),
  del: vi.fn<Parameters<Redis['del']>>().mockResolvedValue(1),
} as unknown as Redis;

const mockLogger = {
  log: vi.fn(),
} as unknown as Logger;

const sampleMsg: PostCreatedPayload = {
  eventId: 'evt-001',
  routingKey: 'posts.created',
  occurredAt: new Date().toISOString(),
  postId: 'post-abc',
  workspaceId: 'ws-xyz',
  createdByUserId: 'user-111',
};

describe('PostCreatedConsumer', () => {
  let consumer: PostCreatedConsumer;

  beforeEach(() => {
    consumer = new PostCreatedConsumer(mockRedis, mockLogger);
    vi.clearAllMocks();
  });

  it('returns early without logging when the event was already processed (duplicate)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null); // NX condition failed — key exists

    const result = await consumer.onPostCreated(sampleMsg);

    expect(result).toBeUndefined();
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it('logs the event on first delivery (new event)', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK'); // NX condition met — key was set

    await consumer.onPostCreated(sampleMsg);

    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockLogger.log).toHaveBeenCalledWith(
      { postId: 'post-abc', workspaceId: 'ws-xyz' },
      'PostCreatedConsumer: received posts.created',
    );
  });

  it('sets the dedup key with correct key pattern and TTL', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    await consumer.onPostCreated(sampleMsg);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'dedup:evt-001',
      '1',
      'EX',
      86400,
      'NX',
    );
  });

  it('deletes the dedup key and re-throws on a transient error', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');
    const transientError = new Error('logger down');
    vi.mocked(mockLogger.log).mockImplementationOnce(() => {
      throw transientError;
    });

    await expect(consumer.onPostCreated(sampleMsg)).rejects.toThrow('logger down');
    expect(mockRedis.del).toHaveBeenCalledWith('dedup:evt-001');
  });
});
