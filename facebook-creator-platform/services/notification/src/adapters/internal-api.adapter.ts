import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IInternalApiClient } from '../ports/internal-api.client.port';

/** Timeout for internal API calls (ms). */
const TIMEOUT_MS = 5_000;

/**
 * `IInternalApiClient` implementation that calls `apps/api` internal endpoints
 * with `x-internal-secret` authentication (ADR-050).
 *
 * Reads `APPS_API_INTERNAL_URL` and `INTERNAL_API_SECRET` from config.
 * Fails fast at startup if either is absent.
 */
@Injectable()
export class InternalApiAdapter extends IInternalApiClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  /**
   * @param config - ConfigService; must have `APPS_API_INTERNAL_URL` and
   *                 `INTERNAL_API_SECRET` set.
   */
  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('APPS_API_INTERNAL_URL');
    this.secret = this.config.getOrThrow<string>('INTERNAL_API_SECRET');
  }

  /** {@inheritDoc IInternalApiClient.getWorkspaceMembers} */
  async getWorkspaceMembers(
    workspaceId: string,
  ): Promise<Array<{ userId: string; role: string }>> {
    const res = await fetch(
      `${this.baseUrl}/internal/workspaces/${workspaceId}/members`,
      {
        headers: { 'x-internal-secret': this.secret },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      throw new Error(
        `InternalApiAdapter: GET /internal/workspaces/${workspaceId}/members responded ${res.status}`,
      );
    }

    return res.json() as Promise<Array<{ userId: string; role: string }>>;
  }
}
