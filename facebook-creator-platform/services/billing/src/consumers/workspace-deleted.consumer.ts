import { Controller } from '@nestjs/common';
import { EventPattern, Payload, Ctx } from '@nestjs/microservices';
import type { RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import type { Channel, Message } from 'amqplib';
import { BillingService } from '../billing.service';

/**
 * Payload shape of the `workspace.deleted` event published by `apps/api`
 * after a workspace is soft-deleted (W-1, ADR-109 Fix 4).
 */
interface WorkspaceDeletedPayload {
  workspaceId: string;
  workspaceName: string;
  deletedBy: string;
  deletedAt: string;
  cancelledPostCount: number;
  memberCount: number;
}

/**
 * RabbitMQ consumer for the `workspace.deleted` routing key.
 *
 * Receives `WorkspaceDeletedEvent` from the `fcp.events` topic exchange and
 * cancels the workspace's Stripe subscription via `BillingService`.
 *
 * **Choreography** (ADR-109 Fix 4): billing reacts to the domain event independently
 * instead of being called synchronously by `WorkspaceService`. This decouples the
 * billing service from the workspace deletion critical path.
 *
 * **Idempotency**: `BillingService.cancelWorkspaceSubscription` is a no-op for
 * free-plan workspaces and already-cancelled subscriptions, so message redelivery
 * (e.g., after a crash before ack) is safe without Redis dedup.
 *
 * **Error handling**: unexpected errors (e.g., DB failure) nack with requeue so the
 * broker redelivers. Permanent failures (Stripe 4xx) should be caught inside
 * `cancelWorkspaceSubscription` and returned as `err(AppError)`, which this consumer
 * treats as a nack to allow operator inspection via the DLQ.
 */
@Controller()
export class WorkspaceDeletedConsumer {
  constructor(
    private readonly orm: MikroORM,
    private readonly billing: BillingService,
  ) {}

  /**
   * Handles the `workspace.deleted` event by cancelling the Stripe subscription.
   *
   * @param data - Deserialised `WorkspaceDeletedEvent` payload.
   * @param ctx  - RMQ context providing ack/nack access.
   */
  @EventPattern('workspace.deleted')
  async onWorkspaceDeleted(
    @Payload() data: WorkspaceDeletedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    try {
      await RequestContext.create(this.orm.em, async () => {
        const result = await this.billing.cancelWorkspaceSubscription(data.workspaceId);
        result.match(
          () => undefined,
          (e) => {
            throw new Error(`cancelWorkspaceSubscription failed: ${e.message}`);
          },
        );
      });
      channel.ack(msg);
    } catch {
      channel.nack(msg, false, true);
    }
  }
}
