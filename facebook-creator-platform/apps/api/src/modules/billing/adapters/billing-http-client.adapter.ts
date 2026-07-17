import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CheckoutRequest, CheckoutResponse, QuotaResponse, SubscriptionResponse } from '@fcp/billing-contracts';
import { DownstreamServiceError } from '../../../common/http/http-client.port';
import { IBillingHttpClient } from '../ports/billing-http.client.port';

/**
 * HTTP client adapter for `services/billing`.
 *
 * Uses the native `fetch` API (Node 25 built-in). Reads `BILLING_SERVICE_URL`
 * from config via `getOrThrow` — must include the `/api/v1` prefix
 * (e.g. `http://localhost:3001/api/v1`).
 *
 * Timeout: reads `HTTP_CLIENT_TIMEOUT_MS` (default 5 000 ms) from config and
 * applies `AbortSignal.timeout` to every outbound call.
 *
 * **`getPostLimit` does NOT provide a fallback** — it throws `DownstreamServiceError(503)`
 * on any failure. `BillingQuotaAdapter` is the correct place for the fail-open constant
 * because it is a quota-policy decision, not an HTTP-transport concern.
 */
@Injectable()
export class BillingHttpClientAdapter extends IBillingHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('BILLING_SERVICE_URL');
    this.timeoutMs = this.config.get<number>('HTTP_CLIENT_TIMEOUT_MS', 5_000);
  }

  /**
   * Forwards a checkout request to `services/billing POST /checkout`.
   *
   * @param params - `CheckoutRequest` — plan code and workspace ID.
   * @returns `CheckoutResponse` — the Stripe Checkout URL.
   * @throws {DownstreamServiceError} on HTTP error or connection/timeout failure.
   */
  async createCheckoutSession(params: CheckoutRequest): Promise<CheckoutResponse> {
    const url = `${this.baseUrl}/checkout`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify(params),
      });
    } catch {
      throw new DownstreamServiceError(503, url);
    }
    if (!res.ok) {
      throw new DownstreamServiceError(res.status, url);
    }
    return res.json() as Promise<CheckoutResponse>;
  }

  /**
   * Fetches the post quota for a workspace from `services/billing GET /workspaces/:id/quota`.
   *
   * Throws `DownstreamServiceError(503)` on connection failure or timeout.
   * Callers that need a fail-open behavior (e.g. `BillingQuotaAdapter`) must
   * catch and return a hardcoded fallback themselves.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns The post limit for the workspace's current plan.
   * @throws {DownstreamServiceError} on non-2xx response or connection/timeout failure.
   */
  async getPostLimit(workspaceId: string): Promise<number> {
    const url = `${this.baseUrl}/workspaces/${workspaceId}/quota`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new DownstreamServiceError(503, url);
    }
    if (!res.ok) throw new DownstreamServiceError(res.status, url);
    const data = await res.json() as QuotaResponse;
    return data.postLimit;
  }

  /**
   * Fetches the current subscription for a workspace from `services/billing`.
   *
   * @param workspaceId - UUID of the workspace.
   * @returns `SubscriptionResponse` with plan metadata.
   * @throws {DownstreamServiceError} with status 404 when no subscription exists,
   *         or with status 503 when the billing service is unavailable.
   */
  async getSubscription(workspaceId: string): Promise<SubscriptionResponse> {
    const url = `${this.baseUrl}/workspaces/${workspaceId}/subscription`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new DownstreamServiceError(503, url);
    }
    if (!res.ok) throw new DownstreamServiceError(res.status, url);
    return res.json() as Promise<SubscriptionResponse>;
  }
}
