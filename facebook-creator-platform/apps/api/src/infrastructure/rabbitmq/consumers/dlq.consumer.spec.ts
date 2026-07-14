import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RmqContext } from '@nestjs/microservices';
import { DlqConsumer } from './dlq.consumer';
import { IMessagingLogRepository } from '../../../common/events/messaging-log.port';

const mockMessagingLog: IMessagingLogRepository = {
  insertPending: vi.fn().mockResolvedValue(undefined),
  markProcessed: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markDlq: vi.fn().mockResolvedValue(undefined),
  insertDeadLetter: vi.fn().mockResolvedValue(undefined),
} as unknown as IMessagingLogRepository;

const mockChannel = { ack: vi.fn(), nack: vi.fn() };
const mockMsg = {};
const mockCtx = {
  getChannelRef: () => mockChannel,
  getMessage: () => mockMsg,
} as unknown as RmqContext;

describe('DlqConsumer', () => {
  let consumer: DlqConsumer;

  beforeEach(() => {
    consumer = new DlqConsumer(mockMessagingLog);
    vi.clearAllMocks();
  });

  it('calls markDlq and insertDeadLetter and acks when the message carries a valid eventId', async () => {
    const data = { eventId: 'evt-uuid-1', routingKey: 'posts.created' };

    await consumer.onDeadLetter(data, mockCtx);

    expect(mockMessagingLog.markDlq).toHaveBeenCalledWith('evt-uuid-1');
    expect(mockMessagingLog.insertDeadLetter).toHaveBeenCalledWith(
      'evt-uuid-1',
      'Message permanently nacked and routed to DLQ',
      0,
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('nacks without requeue and makes no DB calls when eventId is absent', async () => {
    const data = { routingKey: 'posts.created' }; // no eventId

    await consumer.onDeadLetter(data, mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockMessagingLog.markDlq).not.toHaveBeenCalled();
    expect(mockMessagingLog.insertDeadLetter).not.toHaveBeenCalled();
  });

  it('nacks without requeue when eventId is not a string', async () => {
    const data = { eventId: 12345 };

    await consumer.onDeadLetter(data, mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    expect(mockMessagingLog.markDlq).not.toHaveBeenCalled();
  });

  it('nacks with requeue when markDlq throws so RabbitMQ redelivers', async () => {
    const dbError = new Error('connection lost');
    vi.mocked(mockMessagingLog.markDlq).mockRejectedValueOnce(dbError);

    await consumer.onDeadLetter({ eventId: 'evt-uuid-2' }, mockCtx);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
