import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { DlqConsumer } from './dlq.consumer';
import { IMessagingLogRepository } from '../../../common/events/messaging-log.port';

const mockMessagingLog: IMessagingLogRepository = {
  insertPending: vi.fn().mockResolvedValue(undefined),
  markProcessed: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markDlq: vi.fn().mockResolvedValue(undefined),
  insertDeadLetter: vi.fn().mockResolvedValue(undefined),
} as unknown as IMessagingLogRepository;

describe('DlqConsumer', () => {
  let consumer: DlqConsumer;

  beforeEach(() => {
    consumer = new DlqConsumer(mockMessagingLog);
    vi.clearAllMocks();
  });

  it('calls markDlq and insertDeadLetter when the message carries a valid eventId', async () => {
    const msg = { eventId: 'evt-uuid-1', routingKey: 'posts.created' };

    const result = await consumer.onDeadLetter(msg);

    expect(result).toBeUndefined();
    expect(mockMessagingLog.markDlq).toHaveBeenCalledWith('evt-uuid-1');
    expect(mockMessagingLog.insertDeadLetter).toHaveBeenCalledWith(
      'evt-uuid-1',
      'Message permanently nacked and routed to DLQ',
      0,
    );
  });

  it('returns Nack(false) and makes no DB calls when eventId is absent', async () => {
    const msg = { routingKey: 'posts.created' }; // no eventId

    const result = await consumer.onDeadLetter(msg);

    expect(result).toBeInstanceOf(Nack);
    expect(mockMessagingLog.markDlq).not.toHaveBeenCalled();
    expect(mockMessagingLog.insertDeadLetter).not.toHaveBeenCalled();
  });

  it('returns Nack(false) when eventId is not a string', async () => {
    const msg = { eventId: 12345 };

    const result = await consumer.onDeadLetter(msg);

    expect(result).toBeInstanceOf(Nack);
    expect(mockMessagingLog.markDlq).not.toHaveBeenCalled();
  });

  it('rethrows when markDlq throws so RabbitMQ redelivers', async () => {
    const dbError = new Error('connection lost');
    vi.mocked(mockMessagingLog.markDlq).mockRejectedValueOnce(dbError);

    await expect(
      consumer.onDeadLetter({ eventId: 'evt-uuid-2' }),
    ).rejects.toThrow('connection lost');
  });
});
