import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RabbitMqEventBus, FCP_EVENTS_EXCHANGE } from './rabbitmq-event-bus';
import { IMessagingLogRepository } from './messaging-log.port';
import { PostCreatedEvent } from '../../modules/posts/events/post-created.event';
import { PostPublishedEvent } from '../../modules/posts/events/post-published.event';

const mockAmqp = {
  publish: vi.fn<Parameters<AmqpConnection['publish']>>().mockResolvedValue(undefined),
} as unknown as AmqpConnection;

const mockMessagingLog: IMessagingLogRepository = {
  insertPending: vi.fn().mockResolvedValue(undefined),
  markProcessed: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markDlq: vi.fn().mockResolvedValue(undefined),
  insertDeadLetter: vi.fn().mockResolvedValue(undefined),
} as unknown as IMessagingLogRepository;

describe('RabbitMqEventBus', () => {
  let bus: RabbitMqEventBus;

  beforeEach(() => {
    bus = new RabbitMqEventBus(mockAmqp, mockMessagingLog);
    vi.clearAllMocks();
  });

  it('publishes PostCreatedEvent to fcp.events with routing key posts.created', async () => {
    const event = new PostCreatedEvent('post-1', 'ws-1', 'user-1');
    await bus.publish(event);

    expect(mockAmqp.publish).toHaveBeenCalledOnce();
    expect(mockAmqp.publish).toHaveBeenCalledWith(
      FCP_EVENTS_EXCHANGE,
      'posts.created',
      expect.objectContaining({
        eventId: event.eventId,
        postId: 'post-1',
        workspaceId: 'ws-1',
        createdByUserId: 'user-1',
        routingKey: 'posts.created',
      }),
    );
  });

  it('publishes PostPublishedEvent to fcp.events with routing key posts.published', async () => {
    const event = new PostPublishedEvent('post-2', 'ws-2', 'fb-post-99', 'fa-uuid-2', 'user-uuid-2');
    await bus.publish(event);

    expect(mockAmqp.publish).toHaveBeenCalledOnce();
    expect(mockAmqp.publish).toHaveBeenCalledWith(
      FCP_EVENTS_EXCHANGE,
      'posts.published',
      expect.objectContaining({
        eventId: event.eventId,
        postId: 'post-2',
        facebookGraphPostId: 'fb-post-99',
        routingKey: 'posts.published',
      }),
    );
  });

  it('includes occurredAt as an ISO string in the payload', async () => {
    const event = new PostCreatedEvent('post-3', 'ws-3', 'user-3');
    await bus.publish(event);

    const [, , payload] = vi.mocked(mockAmqp.publish).mock.calls[0];
    expect(typeof (payload as Record<string, unknown>)['occurredAt']).toBe('string');
  });

  it('writes a pending log row before amqp.publish', async () => {
    const event = new PostCreatedEvent('post-4', 'ws-4', 'user-4');

    // track call order
    const callOrder: string[] = [];
    vi.mocked(mockMessagingLog.insertPending).mockImplementation(async () => {
      callOrder.push('insertPending');
    });
    vi.mocked(mockAmqp.publish).mockImplementation(async () => {
      callOrder.push('amqp.publish');
    });

    await bus.publish(event);

    expect(callOrder).toEqual(['insertPending', 'amqp.publish']);
    expect(mockMessagingLog.insertPending).toHaveBeenCalledWith(
      event.eventId,
      'posts.created',
      FCP_EVENTS_EXCHANGE,
      'posts.created',
      expect.objectContaining({ eventId: event.eventId }),
    );
  });

  it('marks the log row as processed after successful publish', async () => {
    const event = new PostCreatedEvent('post-5', 'ws-5', 'user-5');
    await bus.publish(event);

    expect(mockMessagingLog.markProcessed).toHaveBeenCalledWith(event.eventId);
    expect(mockMessagingLog.markFailed).not.toHaveBeenCalled();
  });

  it('marks the log row as failed and rethrows when amqp.publish throws', async () => {
    const event = new PostCreatedEvent('post-6', 'ws-6', 'user-6');
    const publishError = new Error('broker unavailable');
    vi.mocked(mockAmqp.publish).mockRejectedValueOnce(publishError);

    await expect(bus.publish(event)).rejects.toThrow('broker unavailable');

    expect(mockMessagingLog.markFailed).toHaveBeenCalledWith(event.eventId);
    expect(mockMessagingLog.markProcessed).not.toHaveBeenCalled();
  });
});
