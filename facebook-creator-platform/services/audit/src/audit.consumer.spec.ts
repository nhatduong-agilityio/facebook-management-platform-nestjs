import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from 'nestjs-pino';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { AuditConsumer } from './audit.consumer';
import { IAuditEventRepository } from './ports/audit-event.repository.port';

const mockRepo = {
  insert: vi.fn(),
  findByWorkspace: vi.fn(),
  findById: vi.fn(),
} as unknown as IAuditEventRepository;

const mockLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const amqpMsg = { fields: { routingKey: 'posts.published' } };

describe('AuditConsumer', () => {
  let consumer: AuditConsumer;

  beforeEach(() => {
    consumer = new AuditConsumer(mockRepo, mockLogger);
    vi.clearAllMocks();
  });

  it('inserts an audit doc for a new event', async () => {
    vi.mocked(mockRepo.insert).mockResolvedValue(undefined);
    const msg = { eventId: 'evt-1', workspaceId: 'ws-1', postId: 'p-1' };

    await consumer.onEvent(msg, amqpMsg);

    expect(mockRepo.insert).toHaveBeenCalledWith({
      eventId: 'evt-1',
      routingKey: 'posts.published',
      workspaceId: 'ws-1',
      payload: { eventId: 'evt-1', workspaceId: 'ws-1', postId: 'p-1' },
    });
  });

  it('strips PII fields from the payload before inserting', async () => {
    vi.mocked(mockRepo.insert).mockResolvedValue(undefined);
    const msg = { eventId: 'evt-2', workspaceId: 'ws-1', email: 'user@example.com', invitationId: 'inv-1' };

    await consumer.onEvent(msg, amqpMsg);

    const insertCall = vi.mocked(mockRepo.insert).mock.calls[0][0];
    expect(insertCall.payload).not.toHaveProperty('email');
    expect(insertCall.payload).toHaveProperty('invitationId', 'inv-1');
  });

  it('returns Nack(false) and does not insert when eventId is missing', async () => {
    const msg = { workspaceId: 'ws-1' } as never;

    const result = await consumer.onEvent(msg, amqpMsg);

    expect(result).toBeInstanceOf(Nack);
    expect(mockRepo.insert).not.toHaveBeenCalled();
  });

  it('sets workspaceId to null for events without a workspaceId field', async () => {
    vi.mocked(mockRepo.insert).mockResolvedValue(undefined);
    const msg = { eventId: 'evt-3', pageId: 'page-abc' };

    await consumer.onEvent(msg, amqpMsg);

    expect(mockRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null }),
    );
  });

  it('rethrows non-duplicate errors so RabbitMQ redelivers', async () => {
    const boom = new Error('MongoDB connection lost');
    vi.mocked(mockRepo.insert).mockRejectedValue(boom);
    const msg = { eventId: 'evt-4', workspaceId: 'ws-1' };

    await expect(consumer.onEvent(msg, amqpMsg)).rejects.toThrow('MongoDB connection lost');
  });
});
