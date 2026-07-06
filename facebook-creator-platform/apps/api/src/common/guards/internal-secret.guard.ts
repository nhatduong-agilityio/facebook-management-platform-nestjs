import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guards internal HTTP endpoints (`/internal/*`) called by sibling services.
 *
 * Checks the `x-internal-secret` request header against `INTERNAL_API_SECRET`
 * from env (ADR-050). Returns 401 on missing or mismatched secret.
 *
 * Not used on public or Clerk-authenticated routes.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  private readonly secret: string;

  /** @param config - NestJS ConfigService (global). */
  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('INTERNAL_API_SECRET');
  }

  /** @inheritdoc */
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers['x-internal-secret'];
    if (provided !== this.secret) throw new UnauthorizedException('Invalid internal secret');
    return true;
  }
}
