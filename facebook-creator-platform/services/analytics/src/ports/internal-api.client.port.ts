/**
 * Response shape from `GET /internal/facebook-accounts/:id` on `apps/api`.
 */
export interface InternalFacebookAccount {
  /** UUID v7 of the `FacebookAccount` record. */
  id: string;
  /** Decrypted page access token (AES-256-GCM decrypted by apps/api). */
  pageToken: string;
}

/**
 * Port: HTTP client for `apps/api` internal endpoints (ADR-050).
 *
 * Services depend on this abstract class only (§14 — ports & adapters).
 * The adapter implementation reads `APPS_API_INTERNAL_URL` and `INTERNAL_API_SECRET`
 * from env and sets the `x-internal-secret` header on every request.
 */
export abstract class IInternalApiClient {
  /**
   * Fetches the decrypted page access token for a `FacebookAccount`.
   *
   * Calls `GET /internal/facebook-accounts/:id` on `apps/api`.
   *
   * @param id - UUID v7 of the `FacebookAccount` record.
   * @returns `{ id, pageToken }` — throws if the account is not found (404) or the secret is rejected (401).
   */
  abstract getFacebookAccount(id: string): Promise<InternalFacebookAccount>;
}
