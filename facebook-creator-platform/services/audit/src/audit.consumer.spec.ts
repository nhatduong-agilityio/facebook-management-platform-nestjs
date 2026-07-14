import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AuditConsumer } from './audit.consumer';
import { IAuditEventRepository } from './ports/audit-event.repository.port';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

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

describe('AuditConsumer', () => {
  let consumer: AuditConsumer;
  let mockChannel: { ack: ReturnType<typeof vi.fn>; nack: ReturnType<typeof vi.fn> };
  let mockMsg: { fields: { routingKey: string } };
  let mockCtx: RmqContext;

  beforeEach(() => {
    mockChannel = { ack: vi.fn(), nack: vi.fn() };
    mockMsg = { fields: { routingKey: 'posts.published' } };
    mockCtx = {
      getChannelRef: () => mockChannel,
      getMessage: () => mockMsg,
    } as unknown as RmqContext;
    const orm = { em: {} } as unknown as MikroORM;
    consumer = new AuditConsumer(orm, mockRepo, mockLogger);
    vi.clearAllMocks();
  });

  it('inserts an audit doc with the AMQP routing key and acks', async () => {
    vi.mocked(mockRepo.insert).mockResolvedValue(undefined);
    const data = { eventId: 'evt-1', workspaceId: 'ws-1', postId: 'p-1' };

    await consumer.onEvent(data, mockCtx);

    expect(mockRepo.insert).toHaveBeenCalledWith({
      eventId: 'evt-1',
      routingKey: 'posts.published',
      workspaceId: 'ws-1',
      payload: { eventId: 'evt-1', workspaceId: 'ws-1', postId: 'p-1' },
    });
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('strips PII fields from the payload before inserting and acks', async () => {
    vi.mocked(mockRepo.insert).mockResolvedValue(undefined);
    const data = { eventId: 'evt-2', workspaceId: 'ws-1', email: 'user@example.com', invitationId: 'inv-1' };

    await consumer.onEvent(data, mockCtx);

    const insertCall = vi.mocked(mockRepo.insert).mock.calls[0][0];
    expect(insertCall.payload).not.toHaveProperty('email');
    expect(insertCall.payload).toHaveProperty('invitationId', 'inv-1');
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('nacks without requeue and does not insert when eventId is missing', async () => {
    const data = { workspaceId: 'ws-1' } as never;

    await consumer.onEvent(data, mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    expect(mockRepo.insert).not.toHaveBeenCalled();
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('sets workspaceId to null for events without a workspaceId field and acks', async () => {
    vi.mocked(mockRepo.insert).mockResolvedValue(undefined);
    const data = { eventId: 'evt-3', pageId: 'page-abc' };

    await consumer.onEvent(data, mockCtx);

    expect(mockRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null }),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('nacks with requeue on transient DB error', async () => {
    vi.mocked(mockRepo.insert).mockRejectedValue(new Error('MongoDB connection lost'));
    const data = { eventId: 'evt-4', workspaceId: 'ws-1' };

    await consumer.onEvent(data, mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
