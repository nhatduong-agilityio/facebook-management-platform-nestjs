import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  FacebookTokenExpiringEmailConsumer,
  FacebookTokenExpiringPayload,
} from './facebook-token-expiring.consumer';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<FacebookTokenExpiringPayload> = {}): FacebookTokenExpiringPayload => ({
  eventId: 'evt-5',
  accountId: 'fa-1',
  workspaceId: 'ws-1',
  pageId: '111222333',
  tokenExpiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
  ...overrides,
});

const makeLog = (id = 'log-5') => ({ id } as never);

const makeMockAmqpMsg = (deathCount = 0) => ({
  properties: {
    headers: deathCount > 0
      ? { 'x-death': [{ queue: 'email.facebook.token_expiring', count: deathCount }] }
      : {},
  },
} as never);

describe('FacebookTokenExpiringEmailConsumer', () => {
  let consumer: FacebookTokenExpiringEmailConsumer;
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
    consumer = new FacebookTokenExpiringEmailConsumer(
      orm, internalApi, emailProvider, emailLogRepo, redis as never, logger as never,
      amqpConnection as unknown as AmqpConnection,
    );
  });

  it('resolves owner email, creates log, sends email, and marks sent', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockResolvedValue({ ownerEmail: 'owner@example.com' });
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog());

    await consumer.onTokenExpiring(makeMsg(), makeMockAmqpMsg());

    expect(internalApi.getWorkspaceOwnerEmail).toHaveBeenCalledWith('ws-1');
    expect(emailLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emailType: 'token_expiring',
        recipientEmail: 'owner@example.com',
        relatedEntityType: 'facebook_account',
        relatedEntityId: 'fa-1',
      }),
    );
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', templateName: 'token-expiring' }),
    );
    expect(emailLogRepo.updateSent).toHaveBeenCalledWith('log-5', expect.any(Date));
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('skips duplicate events', async () => {
    redis.set.mockResolvedValue(null);

    await consumer.onTokenExpiring(makeMsg(), makeMockAmqpMsg());

    expect(internalApi.getWorkspaceOwnerEmail).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('clears dedup key and returns Nack on transient error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockRejectedValue(new Error('API down'));

    const result = await consumer.onTokenExpiring(makeMsg(), makeMockAmqpMsg(0));

    expect(result).toEqual(expect.objectContaining({ requeue: false }));
    expect(redis.del).toHaveBeenCalledWith('dedup:email:evt-5');
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('publishes to DLQ and acks on permanent email error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockResolvedValue({ ownerEmail: 'owner@example.com' });
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog());
    vi.mocked(emailProvider.send).mockRejectedValue(new PermanentEmailError('blocked'));

    const result = await consumer.onTokenExpiring(makeMsg(), makeMockAmqpMsg(0));

    expect(result).toBeUndefined(); // Ack
    expect(emailLogRepo.updateFailed).toHaveBeenCalledWith('log-5', 1);
    expect(amqpConnection.publish).toHaveBeenCalledWith('fcp.dlq', 'dead', expect.anything(), expect.anything());
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('publishes to DLQ and acks when retries are exhausted', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getWorkspaceOwnerEmail).mockRejectedValue(new Error('Resend 503'));

    const result = await consumer.onTokenExpiring(makeMsg(), makeMockAmqpMsg(3));

    expect(result).toBeUndefined(); // Ack
    expect(emailLogRepo.updateFailed).not.toHaveBeenCalled();
    expect(amqpConnection.publish).toHaveBeenCalledWith('fcp.dlq', 'dead', expect.anything(), expect.anything());
    expect(redis.del).not.toHaveBeenCalled();
  });
});
