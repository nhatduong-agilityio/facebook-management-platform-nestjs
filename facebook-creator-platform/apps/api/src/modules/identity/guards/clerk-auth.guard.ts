import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import { IdentityService } from '../identity.service';

/**
 * Authentication guard that verifies a Clerk-issued JWT on every protected request.
 *
 * Flow:
 *  1. Extracts the Bearer token from the `Authorization` header.
 *  2. Calls `verifyToken` (local crypto check — no Clerk API call).
 *  3. Calls `IdentityService.getOrCreateUser` to resolve or provision the local `User`.
 *  4. Attaches the `User` to `request.user`.
 *
 * Throws `UnauthorizedException` (401) when the token is missing, malformed, or
 * expired, or when the account is inactive (BR-R03).
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly identityService: IdentityService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validates the incoming request and attaches the authenticated user.
   *
   * @param context - NestJS execution context providing access to the HTTP request.
   * @returns `true` when the request is authenticated; throws otherwise.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: this.config.getOrThrow<string>('CLERK_SECRET_KEY'),
      });
      clerkUserId = payload.sub;
    } catch (err) {
      this.logger.warn(`verifyToken failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    const result = await this.identityService.getOrCreateUser(clerkUserId);

    if (result.isErr()) {
      throw new UnauthorizedException(result.error.message);
    }

    request.user = result.value;
    return true;
  }

  /** Extracts the raw JWT from `Authorization: Bearer <token>`. */
  private extractBearerToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
