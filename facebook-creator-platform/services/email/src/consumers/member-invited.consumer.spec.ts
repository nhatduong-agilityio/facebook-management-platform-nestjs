import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { MemberInvitedEmailConsumer, MemberInvitedPayload } from './member-invited.consumer';
import { IEmailProvider } from '../ports/email.provider.port';
import { IEmailDeliveryLogRepository } from '../ports/email-delivery-log.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';
import { PermanentEmailError } from '../errors/permanent-email.error';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return { ...actual, RequestContext: { create: (_em: unknown, fn: () => Promise<unknown>) => fn() } };
});

const makeMsg = (overrides: Partial<MemberInvitedPayload> = {}): MemberInvitedPayload => ({
  eventId: 'evt-1',
  workspaceId: 'ws-1',
  invitationId: 'inv-1',
  email: 'alice@example.com',
  role: 'editor',
  invitedByUserId: 'user-owner',
  ...overrides,
});

const makeLog = (id = 'log-1') => ({ id } as unknown as ReturnType<IEmailDeliveryLogRepository['create']> extends Promise<infer T> ? T : never);

const makeInvitationCtx = () => ({ token: 'a'.repeat(64) });

const makeMockAmqpMsg = (deathCount = 0) => ({
  properties: {
    headers: deathCount > 0
      ? { 'x-death': [{ queue: 'email.workspace.member-invited', count: deathCount }] }
      : {},
  },
} as never);

describe('MemberInvitedEmailConsumer', () => {
  let consumer: MemberInvitedEmailConsumer;
  let internalApi: IInternalApiClient;
  let emailProvider: IEmailProvider;
  let emailLogRepo: IEmailDeliveryLogRepository;
  let redis: { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let logger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let amqpConnection: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    internalApi = {
      getUserEmail: vi.fn(),
      getWorkspaceOwnerEmail: vi.fn(),
      getInvitationEmailContext: vi.fn(),
    } as unknown as IInternalApiClient;
    emailProvider = { send: vi.fn().mockResolvedValue(undefined) } as unknown as IEmailProvider;
    emailLogRepo = { create: vi.fn(), updateSent: vi.fn(), updateFailed: vi.fn() } as unknown as IEmailDeliveryLogRepository;
    redis = { set: vi.fn(), del: vi.fn() };
    logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    config = { get: vi.fn().mockImplementation((key: string, def: string) => key === 'API_URL' ? 'http://localhost:3000' : def) };
    amqpConnection = { publish: vi.fn().mockResolvedValue(undefined) };
    const orm = { em: {} } as unknown as MikroORM;
    consumer = new MemberInvitedEmailConsumer(
      orm,
      internalApi,
      emailProvider,
      emailLogRepo,
      redis as never,
      logger as never,
      config as never,
      amqpConnection as unknown as AmqpConnection,
    );
  });

  it('fetches invitation context, creates a log row, sends email with acceptUrl, and marks it sent', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getInvitationEmailContext).mockResolvedValue(makeInvitationCtx());
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog() as never);

    await consumer.onMemberInvited(makeMsg(), makeMockAmqpMsg());

    expect(internalApi.getInvitationEmailContext).toHaveBeenCalledWith('inv-1');
    expect(emailLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ emailType: 'invitation', recipientEmail: 'alice@example.com' }),
    );
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        templateName: 'member-invitation',
        data: expect.objectContaining({ acceptUrl: `http://localhost:3000/api/v1/workspaces/ws-1/invitations/${'a'.repeat(64)}/accept` }),
      }),
    );
    expect(emailLogRepo.updateSent).toHaveBeenCalledWith('log-1', expect.any(Date));
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('skips duplicate events (Redis dedup returns null)', async () => {
    redis.set.mockResolvedValue(null);

    await consumer.onMemberInvited(makeMsg(), makeMockAmqpMsg());

    expect(internalApi.getInvitationEmailContext).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('clears the dedup key and returns Nack on transient error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getInvitationEmailContext).mockRejectedValue(new Error('internal API down'));

    const result = await consumer.onMemberInvited(makeMsg(), makeMockAmqpMsg(0));

    expect(result).toEqual(expect.objectContaining({ requeue: false }));
    expect(redis.del).toHaveBeenCalledWith('dedup:email:evt-1');
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('publishes to DLQ and acks on permanent email error', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getInvitationEmailContext).mockResolvedValue(makeInvitationCtx());
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog() as never);
    vi.mocked(emailProvider.send).mockRejectedValue(new PermanentEmailError('domain not verified'));

    const result = await consumer.onMemberInvited(makeMsg(), makeMockAmqpMsg(0));

    expect(result).toBeUndefined(); // Ack
    expect(emailLogRepo.updateFailed).toHaveBeenCalledWith('log-1', 1);
    expect(amqpConnection.publish).toHaveBeenCalledWith('fcp.dlq', 'dead', expect.anything(), expect.anything());
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('publishes to DLQ and acks when retries are exhausted', async () => {
    redis.set.mockResolvedValue('OK');
    vi.mocked(internalApi.getInvitationEmailContext).mockResolvedValue(makeInvitationCtx());
    vi.mocked(emailLogRepo.create).mockResolvedValue(makeLog() as never);
    vi.mocked(emailProvider.send).mockRejectedValue(new Error('Resend 503'));

    const result = await consumer.onMemberInvited(makeMsg(), makeMockAmqpMsg(3));

    expect(result).toBeUndefined(); // Ack
    expect(emailLogRepo.updateFailed).toHaveBeenCalledWith('log-1', 4); // 3 deaths + 1
    expect(amqpConnection.publish).toHaveBeenCalledWith('fcp.dlq', 'dead', expect.anything(), expect.anything());
    expect(redis.del).not.toHaveBeenCalled();
  });
});
