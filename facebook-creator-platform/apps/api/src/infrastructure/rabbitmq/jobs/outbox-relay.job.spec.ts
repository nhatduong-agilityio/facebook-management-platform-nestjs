import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { OutboxRelayJob } from './outbox-relay.job';
import type { IMessagingLogRepository, PendingLogRow } from '../../../common/events/messaging-log.port';
import type { ClientProxy } from '@nestjs/microservices';
import type { Logger } from 'nestjs-pino';

const makeRow = (overrides: Partial<PendingLogRow> = {}): PendingLogRow => ({
  event_id: 'evt-uuid-1',
  routing_key: 'posts.created',
  payload: { eventId: 'evt-uuid-1', workspaceId: 'ws-1' },
  retry_count: 0,
  ...overrides,
});

const mockMessagingLog = {
  insertPending: vi.fn(),
  markProcessed: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn(),
  markDlq: vi.fn(),
  insertDeadLetter: vi.fn(),
  findPendingForRelay: vi.fn().mockResolvedValue([]),
  incrementRetry: vi.fn().mockResolvedValue(undefined),
} as unknown as IMessagingLogRepository;

const mockClient = {
  emit: vi.fn().mockReturnValue(of(undefined)),
} as unknown as ClientProxy;

const mockLogger = {
  log: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe('OutboxRelayJob', () => {
  let job: OutboxRelayJob;

  beforeEach(() => {
    job = new OutboxRelayJob(mockMessagingLog, mockClient, mockLogger);
    vi.clearAllMocks();
    vi.mocked(mockMessagingLog.findPendingForRelay).mockResolvedValue([]);
    vi.mocked(mockMessagingLog.markProcessed).mockResolvedValue(undefined);
    vi.mocked(mockMessagingLog.incrementRetry).mockResolvedValue(undefined);
    vi.mocked(mockClient.emit).mockReturnValue(of(undefined));
  });

  it('does nothing when there are no pending rows', async () => {
    vi.mocked(mockMessagingLog.findPendingForRelay).mockResolvedValue([]);

    await job.run();

    expect(mockClient.emit).not.toHaveBeenCalled();
    expect(mockMessagingLog.markProcessed).not.toHaveBeenCalled();
    expect(mockMessagingLog.incrementRetry).not.toHaveBeenCalled();
  });

  it('emits the stored payload and marks the row processed on success', async () => {
    const row = makeRow();
    vi.mocked(mockMessagingLog.findPendingForRelay).mockResolvedValue([row]);

    await job.run();

    expect(mockClient.emit).toHaveBeenCalledWith(row.routing_key, row.payload);
    expect(mockMessagingLog.markProcessed).toHaveBeenCalledWith(row.event_id);
    expect(mockMessagingLog.incrementRetry).not.toHaveBeenCalled();
  });

  it('increments retry count and continues when the broker throws', async () => {
    const row = makeRow({ event_id: 'evt-fail', retry_count: 2 });
    vi.mocked(mockMessagingLog.findPendingForRelay).mockResolvedValue([row]);
    vi.mocked(mockClient.emit).mockReturnValue(throwError(() => new Error('broker down')));

    await job.run();

    expect(mockMessagingLog.incrementRetry).toHaveBeenCalledWith(row.event_id);
    expect(mockMessagingLog.markProcessed).not.toHaveBeenCalled();
  });

  it('processes rows independently — first row success, second row failure', async () => {
    const rowA = makeRow({ event_id: 'evt-ok', routing_key: 'posts.created' });
    const rowB = makeRow({ event_id: 'evt-err', routing_key: 'posts.published' });

    vi.mocked(mockMessagingLog.findPendingForRelay).mockResolvedValue([rowA, rowB]);
    vi.mocked(mockClient.emit)
      .mockReturnValueOnce(of(undefined))
      .mockReturnValueOnce(throwError(() => new Error('timeout')));

    await job.run();

    expect(mockMessagingLog.markProcessed).toHaveBeenCalledWith(rowA.event_id);
    expect(mockMessagingLog.markProcessed).not.toHaveBeenCalledWith(rowB.event_id);
    expect(mockMessagingLog.incrementRetry).toHaveBeenCalledWith(rowB.event_id);
    expect(mockMessagingLog.incrementRetry).not.toHaveBeenCalledWith(rowA.event_id);
  });
});
