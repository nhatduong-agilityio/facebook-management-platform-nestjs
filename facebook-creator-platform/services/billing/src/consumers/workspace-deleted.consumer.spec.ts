import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import type { RmqContext } from '@nestjs/microservices';
import type { MikroORM } from '@mikro-orm/core';
import { WorkspaceDeletedConsumer } from './workspace-deleted.consumer';
import { BillingService } from '../billing.service';
import { AppError } from '../common/app-error';

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return {
    ...actual,
    RequestContext: {
      create: vi.fn((_em: unknown, fn: () => Promise<void>) => fn()),
    },
  };
});

const mockCancel = vi.fn();
const mockBilling = { cancelWorkspaceSubscription: mockCancel } as unknown as BillingService;
const mockOrm = { em: {} } as unknown as MikroORM;

const mockAck = vi.fn();
const mockNack = vi.fn();
const mockChannel = { ack: mockAck, nack: mockNack };
const mockMsg = {};

function makeCtx(): RmqContext {
  return {
    getChannelRef: () => mockChannel,
    getMessage: () => mockMsg,
  } as unknown as RmqContext;
}

const samplePayload = {
  workspaceId: 'ws-1',
  workspaceName: 'Acme',
  deletedBy: 'owner-1',
  deletedAt: '2026-07-17T02:00:00.000Z',
  cancelledPostCount: 3,
  memberCount: 1,
};

describe('WorkspaceDeletedConsumer', () => {
  let consumer: WorkspaceDeletedConsumer;

  beforeEach(() => {
    consumer = new WorkspaceDeletedConsumer(mockOrm, mockBilling);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // workspace.deleted — happy path
  // ---------------------------------------------------------------------------

  it('calls cancelWorkspaceSubscription with the correct workspaceId', async () => {
    mockCancel.mockResolvedValue(ok(undefined));

    await consumer.onWorkspaceDeleted(samplePayload, makeCtx());

    expect(mockCancel).toHaveBeenCalledWith('ws-1');
  });

  it('acks the message on success', async () => {
    mockCancel.mockResolvedValue(ok(undefined));

    await consumer.onWorkspaceDeleted(samplePayload, makeCtx());

    expect(mockAck).toHaveBeenCalledWith(mockMsg);
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('acks the message when subscription is already cancelled (no-op ok)', async () => {
    mockCancel.mockResolvedValue(ok(undefined));

    await consumer.onWorkspaceDeleted(samplePayload, makeCtx());

    expect(mockAck).toHaveBeenCalledWith(mockMsg);
  });

  // ---------------------------------------------------------------------------
  // workspace.deleted — error path
  // ---------------------------------------------------------------------------

  it('nacks with requeue when cancelWorkspaceSubscription returns err', async () => {
    mockCancel.mockResolvedValue(err(new AppError('INTERNAL', 'Stripe timeout')));

    await consumer.onWorkspaceDeleted(samplePayload, makeCtx());

    expect(mockNack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('nacks with requeue when the billing service throws', async () => {
    mockCancel.mockRejectedValue(new Error('DB connection lost'));

    await consumer.onWorkspaceDeleted(samplePayload, makeCtx());

    expect(mockNack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockAck).not.toHaveBeenCalled();
  });
});
