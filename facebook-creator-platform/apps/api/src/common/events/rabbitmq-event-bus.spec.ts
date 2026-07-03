import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RabbitMqEventBus, FCP_EVENTS_EXCHANGE } from './rabbitmq-event-bus';
import { PostCreatedEvent } from '../../modules/posts/events/post-created.event';
import { PostPublishedEvent } from '../../modules/posts/events/post-published.event';

const mockAmqp = {
  publish: vi.fn<Parameters<AmqpConnection['publish']>>().mockResolvedValue(undefined),
} as unknown as AmqpConnection;

describe('RabbitMqEventBus', () => {
  let bus: RabbitMqEventBus;

  beforeEach(() => {
    bus = new RabbitMqEventBus(mockAmqp);
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
});
