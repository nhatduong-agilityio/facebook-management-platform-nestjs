import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IInternalApiClient,
  type InternalFacebookAccount,
} from '../ports/internal-api.client.port';

/**
 * HTTP adapter for the `apps/api` internal endpoint (ADR-050).
 *
 * Reads `APPS_API_INTERNAL_URL` (base URL, e.g. `http://localhost:3000/api/v1`)
 * and `INTERNAL_API_SECRET` from env. Sets `x-internal-secret` on every request.
 */
@Injectable()
export class InternalApiHttpAdapter extends IInternalApiClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  /** @param config - NestJS ConfigService (global). */
  constructor(config: ConfigService) {
    super();
    this.baseUrl = config.getOrThrow<string>('APPS_API_INTERNAL_URL');
    this.secret = config.getOrThrow<string>('INTERNAL_API_SECRET');
  }

  /** @inheritdoc */
  async getFacebookAccount(id: string): Promise<InternalFacebookAccount> {
    const url = `${this.baseUrl}/internal/facebook-accounts/${id}`;
    const res = await fetch(url, {
      headers: { 'x-internal-secret': this.secret },
    });

    if (res.status === 404) throw new NotFoundException(`FacebookAccount ${id} not found`);
    if (!res.ok) {
      throw new InternalServerErrorException(
        `Internal API error: ${res.status} fetching account ${id}`,
      );
    }

    return res.json() as Promise<InternalFacebookAccount>;
  }
}
