import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { IMessagingLogRepository } from '../../../common/events/messaging-log.port';

/**
 * Consumes messages from the `fcp.dlq` dead-letter exchange.
 *
 * Every queue in the platform declares `deadLetterExchange: 'fcp.dlq'`. When a consumer
 * permanently nacks a message (`channel.nack(msg, false, false)`), RabbitMQ routes it to
 * `fcp.dlq`, which fans out to this consumer's `dlq.logger` queue.
 *
 * On receipt the handler:
 * 1. Updates `messaging.event_message_logs.processing_status` to `'dlq'`.
 * 2. Inserts a `messaging.dead_letter_messages` row for operator inspection.
 *
 * If the message has no `eventId` (schema mismatch or non-domain message) the handler
 * nacks without requeue to avoid an infinite loop — the message is dropped.
 *
 * **Known limitation (hybrid-app handler registry):** Both the topic transport and this
 * fanout transport share the same NestJS handler registry. Dead-lettered messages whose
 * `pattern` field matches a registered domain consumer will be routed to that consumer
 * instead of this handler. Only messages with unrecognised patterns reach this handler.
 * This is acceptable for the training project; a production system would use a separate
 * microservice app for the DLQ consumer.
 */
@Controller()
export class DlqConsumer {
  private readonly logger = new Logger(DlqConsumer.name);

  constructor(private readonly messagingLog: IMessagingLogRepository) {}

  /**
   * Handles a dead-lettered message from `fcp.dlq`.
   *
   * @param data - The unwrapped message payload, expected to contain `eventId`.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('#')
  async onDeadLetter(
    @Payload() data: Record<string, unknown>,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const eventId = data['eventId'];

    if (typeof eventId !== 'string' || !eventId) {
      this.logger.error(
        { msg: data },
        'DLQ message has no eventId — cannot link to event_message_logs; dropping',
      );
      channel.nack(msg, false, false); // permanent drop — no requeue to avoid infinite loop
      return;
    }

    try {
      await this.messagingLog.markDlq(eventId);
      await this.messagingLog.insertDeadLetter(
        eventId,
        'Message permanently nacked and routed to DLQ',
        0,
      );
      this.logger.warn({ eventId }, 'Dead-lettered message recorded');
      channel.ack(msg);
    } catch (err) {
      this.logger.error({ eventId, err }, 'Failed to record dead-letter message; will retry');
      channel.nack(msg, false, true); // transient — requeue
    }
  }
}
