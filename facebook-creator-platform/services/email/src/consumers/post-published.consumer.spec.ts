import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { RmqContext } from '@nestjs/microservices';
import { PostPublishedEmailConsumer, PostPublishedPayload } from './post-published.consumer';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<PostPublishedPayload> = {}): PostPublishedPayload => ({
  eventId: 'evt-2',
  postId: 'post-1',
  workspaceId: 'ws-1',
  facebookGraphPostId: 'fb-post-123',
  facebookAccountId: 'fa-1',
  createdByUserId: 'user-1',
  ...overrides,
});

const makeLog = (id = 'log-2') => ({ id } as never);

describe('PostPublishedEmailConsumer', () => {
  let consumer: PostPublishedEmailConsumer;
  let internalApi: IInternalApiClient;
  let emailProvider: IEmailProvider;
  let emailLogRepo: IEmailDeliveryLogRepository;
  let redis: { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let logger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let mockChannel: { ack: ReturnType<typeof vi.fn>; nack: ReturnType<typeof vi.fn> };
  let mockMsg: object;
  let mockCtx: RmqContext;

  beforeEach(() => {
    internalApi = { getUserEmail: vi.fn(), getWorkspaceOwnerEmail: vi.fn() } as unknown as IInternalApiClient;
    emailProvider = { send: vi.fn().mockResolvedValue(undefined) } as unknown as IEmailProvider;
    emailLogRepo = { create: vi.fn(), updateSent: vi.fn(), updateFailed: vi.fn() } as unknown as IEmailDeliveryLogRepository;
    redis = { set: vi.fn(), del: vi.fn() };
    logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    mockChannel = { ack: vi.fn(), nack: vi.fn() };
    mockMsg = {};
    mockCtx = {
      getChannelRef: () => mockChannel,
      getMessage: () => mockMsg,
    } as unknown as RmqContext;
    const orm = { em: {} } as unknown as MikroORM;
    consumer = new PostPublishedEmailConsumer(
      orm, internalApi, emailProvider, emailLogRepo, redis as never, logger as never,
    );
  });

  it('resolves email, creates log, sends email, marks sent, and acks', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getUserEmail).mockResolvedValue('author@example.com');
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog());

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(internalApi.getUserEmail).toHaveBeenCalledWith('user-1');
    expect(emailLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ emailType: 'publish_success', recipientEmail: 'author@example.com' }),
    );
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'author@example.com', templateName: 'post-published' }),
    );
    expect(emailLogRepo.updateSent).toHaveBeenCalledWith('log-2', expect.any(Date));
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('acks duplicate events without processing', async () => {
    redis.set.mockResolvedValue(null);

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(internalApi.getUserEmail).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('clears dedup key and nacks with requeue on transient error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getUserEmail).mockRejectedValue(new Error('Internal API error'));

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(redis.del).toHaveBeenCalledWith('dedup:email:evt-2');
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('nacks without requeue and marks failed on permanent email error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getUserEmail).mockResolvedValue('author@example.com');
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog());
    vi.mocked(emailProvider.send).mockRejectedValue(new PermanentEmailError('blocked'));

    await consumer.onPostPublished(makeMsg(), mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    expect(emailLogRepo.updateFailed).toHaveBeenCalledWith('log-2', 1);
    expect(redis.del).not.toHaveBeenCalled();
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
