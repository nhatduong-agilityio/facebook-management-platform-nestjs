import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IInternalApiClient } from '../ports/internal-api.client.port';

/** Timeout for internal API calls (ms). */
const TIMEOUT_MS = 5_000;

/**
 * `IInternalApiClient` implementation calling `apps/api` internal endpoints
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

  /** {@inheritDoc IInternalApiClient.getUserEmail} */
  async getUserEmail(userId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/internal/users/${userId}`, {
      headers: { 'x-internal-secret': this.secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(
        `InternalApiAdapter: GET /internal/users/${userId} responded ${res.status}`,
      );
    }

    const body = (await res.json()) as { id: string; email: string };
    return body.email;
  }

  /** {@inheritDoc IInternalApiClient.getWorkspaceOwnerEmail} */
  async getWorkspaceOwnerEmail(workspaceId: string): Promise<{ ownerEmail: string }> {
    const res = await fetch(`${this.baseUrl}/internal/workspaces/${workspaceId}`, {
      headers: { 'x-internal-secret': this.secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(
        `InternalApiAdapter: GET /internal/workspaces/${workspaceId} responded ${res.status}`,
      );
    }

    const body = (await res.json()) as { id: string; ownerId: string; ownerEmail: string };
    return { ownerEmail: body.ownerEmail };
  }

  /** {@inheritDoc IInternalApiClient.getInvitationEmailContext} */
  async getInvitationEmailContext(invitationId: string): Promise<{ token: string }> {
    const res = await fetch(`${this.baseUrl}/internal/invitations/${invitationId}`, {
      headers: { 'x-internal-secret': this.secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(
        `InternalApiAdapter: GET /internal/invitations/${invitationId} responded ${res.status}`,
      );
    }

    const body = (await res.json()) as { token: string };
    return { token: body.token };
  }
}
