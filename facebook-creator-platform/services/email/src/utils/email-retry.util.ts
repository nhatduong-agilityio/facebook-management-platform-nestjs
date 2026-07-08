import type { ConsumeMessage } from 'amqplib';

/** Maximum delivery attempts before a message is routed to the permanent DLQ. */
export const MAX_EMAIL_RETRIES = 3;

/**
 * Reads how many times a message has been dead-lettered from the named queue
 * by inspecting the `x-death` header appended by RabbitMQ on each rejection.
 *
 * @param amqpMsg   - Raw AMQP message passed as the handler's second argument.
 * @param queueName - Name of the consumer queue (e.g. `'email.posts.published'`).
 * @returns Number of previous dead-letters from that queue; `0` on first delivery.
 */
export function getDeathCount(amqpMsg: ConsumeMessage, queueName: string): number {
  const xDeath = amqpMsg.properties.headers?.['x-death'] as
    | Array<{ queue: string; count: number }>
    | undefined;
  return xDeath?.find((d) => d.queue === queueName)?.count ?? 0;
}
