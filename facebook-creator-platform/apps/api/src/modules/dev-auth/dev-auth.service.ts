import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';
import type { DevAuthTokenDto, DevAuthTokenResponseDto } from './dto/dev-auth-token.dto';

/** Shape of the Clerk REST response from `POST /v1/sessions/{id}/tokens[/{template}]`. */
interface ClerkTokenResponse {
  jwt: string;
}

/** Shape of Clerk `POST /v1/sign_in_tokens` response. */
interface ClerkSignInTokenResponse {
  url: string;
}

/**
 * Development-only service that returns a ready-to-use Clerk session JWT for
 * manual API testing.
 *
 * Flow:
 *  1. Resolve the Clerk user id from the request (by `userId` or `email`).
 *  2. Find an active Clerk session for the user.
 *  3a. Session found → generate and return `{ accessToken }` (paste as Bearer).
 *  3b. No session → create a sign-in token and return `{ loginUrl }`.
 *      Open `loginUrl` in a browser, Clerk creates a session, then call this
 *      endpoint again to receive `accessToken`.
 */
@Injectable()
export class DevAuthService {
  private readonly client: ClerkClient;
  private readonly secretKey: string;
  private readonly clerkApiBase = 'https://api.clerk.com/v1';

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.getOrThrow<string>('CLERK_SECRET_KEY');
    this.client = createClerkClient({ secretKey: this.secretKey });
  }

  /**
   * Returns `{ accessToken }` when the user has an active Clerk session, or
   * `{ loginUrl }` when they do not. Call again after visiting `loginUrl` in a
   * browser to receive `accessToken`.
   *
   * @param dto - Identifies the user and optionally a JWT template.
   */
  async generateToken(dto: DevAuthTokenDto): Promise<DevAuthTokenResponseDto> {
    const userId = await this.resolveUserId(dto);
    const session = await this.findActiveSession(userId);

    if (session) {
      return this.generateSessionToken(session.id, dto.template);
    }

    return this.generateLoginUrl(userId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Resolves a Clerk user id from either the explicit `userId` or `email` field. */
  private async resolveUserId(dto: DevAuthTokenDto): Promise<string> {
    if (dto.userId) {
      await this.client.users.getUser(dto.userId);
      return dto.userId;
    }

    if (!dto.email) {
      throw new BadRequestException('Provide either userId or email');
    }

    const result = await this.client.users.getUserList({
      emailAddress: [dto.email],
      limit: 1,
    });

    if (result.data.length === 0) {
      throw new NotFoundException(`No Clerk user found with email: ${dto.email}`);
    }

    return result.data[0].id;
  }

  /**
   * Finds the first active Clerk session for the given user.
   * Fetches up to 10 sessions without a status filter (some Clerk plan tiers
   * ignore the status query param) and filters in-process.
   */
  private async findActiveSession(userId: string): Promise<{ id: string } | null> {
    const result = await this.client.sessions.getSessionList({ userId, limit: 10 });
    const sessions = result.data ?? [];
    const active = sessions.find((s: { status: string }) => s.status === 'active');
    return active ?? null;
  }

  /**
   * Calls `POST /v1/sessions/{id}/tokens[/{template}]` to generate a session JWT
   * and returns it as `accessToken`.
   */
  private async generateSessionToken(sessionId: string, template?: string): Promise<DevAuthTokenResponseDto> {
    const path = template
      ? `/sessions/${sessionId}/tokens/${encodeURIComponent(template)}`
      : `/sessions/${sessionId}/tokens`;

    const response = await fetch(`${this.clerkApiBase}${path}`, {
      method: 'POST',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(`Clerk token generation failed: ${body}`);
    }

    const { jwt } = (await response.json()) as ClerkTokenResponse;
    return { accessToken: jwt };
  }

  /**
   * Creates a Clerk sign-in token and returns its magic-link URL as `loginUrl`.
   * Opening the URL in a browser establishes a Clerk session; the next call to
   * `generateToken` will then return `accessToken`.
   */
  private async generateLoginUrl(userId: string): Promise<DevAuthTokenResponseDto> {
    const response = await fetch(`${this.clerkApiBase}/sign_in_tokens`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 60 * 60 * 24 }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(`Clerk sign-in token creation failed: ${body}`);
    }

    const { url } = (await response.json()) as ClerkSignInTokenResponse;
    return { loginUrl: url };
  }

  /** Common Authorization headers for all Clerk REST API calls. */
  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.secretKey}` };
  }
}
