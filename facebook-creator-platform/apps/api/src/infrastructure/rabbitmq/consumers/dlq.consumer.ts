import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { IMessagingLogRepository } from '../../../common/events/messaging-log.port';

/**
 * Consumes messages from the `fcp.dlq` dead-letter exchange.
 *
 * Every queue in the platform declares `deadLetterExchange: 'fcp.dlq'`. When a consumer
 * permanently nacks a message (`Nack(false)`), RabbitMQ routes it to `fcp.dlq`, which
 * fans out to this consumer's `dlq.logger` queue.
 *
 * On receipt the handler:
 * 1. Updates `messaging.event_message_logs.processing_status` to `'dlq'`.
 * 2. Inserts a `messaging.dead_letter_messages` row for operator inspection.
 *
 * If the message has no `eventId` (schema mismatch or non-domain message) the handler
 * returns `Nack(false)` to avoid an infinite loop — the message is dropped.
 */
@Injectable()
export class DlqConsumer {
  private readonly logger = new Logger(DlqConsumer.name);

  constructor(private readonly messagingLog: IMessagingLogRepository) {}

  /**
   * Handles a dead-lettered message from `fcp.dlq`.
   *
   * @param msg - The original message payload, expected to contain `eventId`.
   * @returns `undefined` on success, or `Nack(false)` if the message cannot be processed.
   */
  @RabbitSubscribe({
    exchange: 'fcp.dlq',
    routingKey: '#',
    queue: 'dlq.logger',
    queueOptions: { durable: true },
  })
  async onDeadLetter(msg: Record<string, unknown>): Promise<void | Nack> {
    const eventId = msg['eventId'];

    if (typeof eventId !== 'string' || !eventId) {
      this.logger.error(
        { msg },
        'DLQ message has no eventId — cannot link to event_message_logs; dropping',
      );
      return new Nack(false);
    }

    try {
      await this.messagingLog.markDlq(eventId);
      await this.messagingLog.insertDeadLetter(
        eventId,
        'Message permanently nacked and routed to DLQ',
        0,
      );
      this.logger.warn({ eventId }, 'Dead-lettered message recorded');
    } catch (err) {
      this.logger.error({ eventId, err }, 'Failed to record dead-letter message; will retry');
      throw err;
    }
  }
}
