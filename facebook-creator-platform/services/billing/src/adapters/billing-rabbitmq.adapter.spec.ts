import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { BillingRabbitMqAdapter } from './billing-rabbitmq.adapter';

const mockClient = {
  emit: vi.fn(),
} as unknown as ClientProxy;

describe('BillingRabbitMqAdapter', () => {
  let adapter: BillingRabbitMqAdapter;

  beforeEach(() => {
    adapter = new BillingRabbitMqAdapter(mockClient);
    vi.clearAllMocks();
  });

  it('emits the routing key and payload to the ClientProxy', async () => {
    vi.mocked(mockClient.emit).mockReturnValue(of(undefined));

    await adapter.publish('billing.subscription_activated', { eventId: 'evt-1', workspaceId: 'ws-1' });

    expect(mockClient.emit).toHaveBeenCalledOnce();
    expect(mockClient.emit).toHaveBeenCalledWith(
      'billing.subscription_activated',
      { eventId: 'evt-1', workspaceId: 'ws-1' },
    );
  });

  it('resolves without error on successful publish', async () => {
    vi.mocked(mockClient.emit).mockReturnValue(of(undefined));

    await expect(
      adapter.publish('billing.subscription_cancelled', { eventId: 'evt-2', workspaceId: 'ws-2' }),
    ).resolves.toBeUndefined();
  });

  it('throws when the ClientProxy emits an error', async () => {
    const brokerError = new Error('RMQ connection lost');
    vi.mocked(mockClient.emit).mockReturnValue(throwError(() => brokerError));

    await expect(
      adapter.publish('billing.subscription_activated', { eventId: 'evt-3' }),
    ).rejects.toThrow('RMQ connection lost');
  });
});
