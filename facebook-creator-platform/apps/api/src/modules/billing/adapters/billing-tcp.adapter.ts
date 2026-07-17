import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { CheckoutRequest, CheckoutResponse, SubscriptionResponse } from '@fcp/billing-contracts';
import { IBillingHttpClient } from '../ports/billing-http.client.port';
import { DownstreamServiceError } from '../../../common/errors/downstream-service.error';

/** DI token for the billing TCP `ClientProxy`. */
export const BILLING_TCP_CLIENT = 'BILLING_TCP_CLIENT';

/** Milliseconds before a TCP RPC call is abandoned and a 503 is surfaced. */
const TCP_TIMEOUT_MS = 3_000;

/**
 * `IBillingHttpClient` implementation backed by NestJS TCP transport (ADR-094).
 *
 * Replaces `BillingHttpClientAdapter` as the concrete adapter for all sync calls
 * from `apps/api` to `services/billing`. Error mapping preserves the same
 * `DownstreamServiceError` contract so `BillingController` and `BillingQuotaAdapter`
 * require no changes.
 *
 * Error mapping:
 * - `RpcException({ code: 'NOT_FOUND' })` → `DownstreamServiceError(404)`
 * - Any other `RpcException` → `DownstreamServiceError(500)`
 * - Timeout / connection refused → `DownstreamServiceError(503)`
 */
@Injectable()
export class BillingTcpAdapter extends IBillingHttpClient {
  constructor(@Inject(BILLING_TCP_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  /**
   * Fetches the post-creation quota limit for a workspace via TCP.
   *
   * Pattern: `billing.get-quota` — payload `{ workspaceId }` → response `{ postLimit }`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns Maximum posts allowed by the workspace's plan.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async getPostLimit(workspaceId: string): Promise<number> {
    try {
      const data = await firstValueFrom(
        this.client
          .send<{ postLimit: number }>('billing.get-quota', { workspaceId })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
      return data.postLimit;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Fetches the current subscription for a workspace via TCP.
   *
   * Pattern: `billing.get-subscription` — payload `{ workspaceId }` → `SubscriptionResponse`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns `SubscriptionResponse` — current subscription with plan metadata.
   * @throws {DownstreamServiceError} with status 404 when no subscription exists,
   *         or status 503 when the billing service is unavailable.
   */
  async getSubscription(workspaceId: string): Promise<SubscriptionResponse> {
    try {
      return await firstValueFrom(
        this.client
          .send<SubscriptionResponse>('billing.get-subscription', { workspaceId })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Creates a Stripe Checkout session via TCP.
   *
   * Pattern: `billing.checkout` — payload `{ workspaceId, planCode }` → `{ url }`.
   *
   * @param params - `CheckoutRequest` with `workspaceId` and `planCode`.
   * @returns `CheckoutResponse` — the Stripe-hosted Checkout URL.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async createCheckoutSession(params: CheckoutRequest): Promise<CheckoutResponse> {
    try {
      return await firstValueFrom(
        this.client
          .send<CheckoutResponse>('billing.checkout', {
            workspaceId: params.workspaceId,
            planCode: params.planCode,
          })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Maps a TCP error to a `DownstreamServiceError` so callers retain the same
   * error-handling contract they had with `BillingHttpClientAdapter`.
   */
  private mapError(e: unknown): DownstreamServiceError {
    if (e instanceof RpcException) {
      const error = e.getError() as { code?: string };
      if (error.code === 'NOT_FOUND') return new DownstreamServiceError(404, 'billing');
      return new DownstreamServiceError(500, 'billing');
    }
    return new DownstreamServiceError(503, 'billing');
  }
}
