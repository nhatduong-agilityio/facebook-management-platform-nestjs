import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { BillingPaymentFailedEmailConsumer } from './billing-payment-failed.consumer';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';
import type { PaymentFailedPayload } from '@fcp/billing-contracts';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<PaymentFailedPayload> = {}): PaymentFailedPayload => ({
  eventId: 'evt-4',
  workspaceId: 'ws-1',
  planCode: 'pro',
  occurredAt: new Date().toISOString(),
  ...overrides,
});

const makeLog = (id = 'log-4') => ({ id } as never);

const makeMockAmqpMsg = (deathCount = 0) => ({
  properties: {
    headers: deathCount > 0
      ? { 'x-death': [{ queue: 'email.billing.payment_failed', count: deathCount }] }
      : {},
  },
} as never);

describe('BillingPaymentFailedEmailConsumer', () => {
  let consumer: BillingPaymentFailedEmailConsumer;
  let internalApi: IInternalApiClient;
  let emailProvider: IEmailProvider;
  let emailLogRepo: IEmailDeliveryLogRepository;
  let redis: { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let logger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let amqpConnection: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    internalApi = { getUserEmail: vi.fn(), getWorkspaceOwnerEmail: vi.fn() } as unknown as IInternalApiClient;
    emailProvider = { send: vi.fn().mockResolvedValue(undefined) } as unknown as IEmailProvider;
    emailLogRepo = { create: vi.fn(), updateSent: vi.fn(), updateFailed: vi.fn() } as unknown as IEmailDeliveryLogRepository;
    redis = { set: vi.fn(), del: vi.fn() };
    logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    amqpConnection = { publish: vi.fn().mockResolvedValue(undefined) };
    const orm = { em: {} } as unknown as MikroORM;
    consumer = new BillingPaymentFailedEmailConsumer(
      orm, internalApi, emailProvider, emailLogRepo, redis as never, logger as never,
      amqpConnection as unknown as AmqpConnection,
    );
  });

  it('resolves owner email, creates log, sends email, and marks sent', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockResolvedValue({ ownerEmail: 'owner@example.com' });
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog());

    await consumer.onPaymentFailed(makeMsg(), makeMockAmqpMsg());

    expect(internalApi.getWorkspaceOwnerEmail).toHaveBeenCalledWith('ws-1');
    expect(emailLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ emailType: 'payment_failed', recipientEmail: 'owner@example.com' }),
    );
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', templateName: 'payment-failed' }),
    );
    expect(emailLogRepo.updateSent).toHaveBeenCalledWith('log-4', expect.any(Date));
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('skips duplicate events', async () => {
    redis.set.mockResolvedValue(null);

    await consumer.onPaymentFailed(makeMsg(), makeMockAmqpMsg());

    expect(internalApi.getWorkspaceOwnerEmail).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('clears dedup key and returns Nack on transient error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockRejectedValue(new Error('workspace not found'));

    const result = await consumer.onPaymentFailed(makeMsg(), makeMockAmqpMsg(0));

    expect(result).toEqual(expect.objectContaining({ requeue: false }));
    expect(redis.del).toHaveBeenCalledWith('dedup:email:evt-4');
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('publishes to DLQ and acks on permanent email error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockResolvedValue({ ownerEmail: 'owner@example.com' });
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog());
    vi.mocked(emailProvider.send).mockRejectedValue(new PermanentEmailError('blocked'));

    const result = await consumer.onPaymentFailed(makeMsg(), makeMockAmqpMsg(0));

    expect(result).toBeUndefined(); // Ack
    expect(emailLogRepo.updateFailed).toHaveBeenCalledWith('log-4', 1);
    expect(amqpConnection.publish).toHaveBeenCalledWith('fcp.dlq', 'dead', expect.anything(), expect.anything());
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('publishes to DLQ and acks when retries are exhausted', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockRejectedValue(new Error('Resend 503'));

    const result = await consumer.onPaymentFailed(makeMsg(), makeMockAmqpMsg(3));

    expect(result).toBeUndefined(); // Ack
    expect(emailLogRepo.updateFailed).not.toHaveBeenCalled();
    expect(amqpConnection.publish).toHaveBeenCalledWith('fcp.dlq', 'dead', expect.anything(), expect.anything());
    expect(redis.del).not.toHaveBeenCalled();
  });
});
