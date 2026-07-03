import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CheckoutRequest, CheckoutResponse, QuotaResponse } from '@fcp/billing-contracts';
import { IBillingHttpClient } from '../ports/billing-http.client.port';

/** Free-plan post limit — used when the billing service is unreachable. */
const FALLBACK_POST_LIMIT = 10;

/**
 * HTTP client adapter for `services/billing`.
 *
 * Uses the native `fetch` API (Node 25 built-in). Reads `BILLING_SERVICE_URL`
 * from config (defaults to `http://localhost:3001` for local dev).
 *
 * On quota lookups, falls back to `FALLBACK_POST_LIMIT` (free-plan default) if the
 * billing service is unreachable — so existing workspaces degrade gracefully, never
 * blocking post creation due to a billing outage.
 */
@Injectable()
export class BillingHttpClientAdapter extends IBillingHttpClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.get<string>('BILLING_SERVICE_URL', 'http://localhost:3001');
  }

  /**
   * Forwards a checkout request to `services/billing POST /checkout`.
   *
   * @param params - `CheckoutRequest` — plan code and workspace ID.
   * @returns `CheckoutResponse` — the Stripe Checkout URL.
   */
  async createCheckoutSession(params: CheckoutRequest): Promise<CheckoutResponse> {
    const res = await fetch(`${this.baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Billing service error ${res.status}: ${body}`);
    }

    return res.json() as Promise<CheckoutResponse>;
  }

  /**
   * Fetches the post quota for a workspace from `services/billing`.
   * Falls back to `FALLBACK_POST_LIMIT` if the service is unreachable (graceful degradation).
   *
   * @param workspaceId - UUID of the workspace.
   * @returns The post limit for the workspace's current plan.
   */
  async getPostLimit(workspaceId: string): Promise<number> {
    try {
      const res = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/quota`);
      if (!res.ok) return FALLBACK_POST_LIMIT;
      const data = await res.json() as QuotaResponse;
      return data.postLimit;
    } catch {
      return FALLBACK_POST_LIMIT;
    }
  }
}
