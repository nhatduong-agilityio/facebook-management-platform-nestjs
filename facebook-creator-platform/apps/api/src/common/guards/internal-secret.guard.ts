import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guards internal HTTP endpoints (`/internal/*`) called by sibling services
 * (analytics, email, notification) for PII resolution (ADR-050).
 *
 * ## Dual-layer security model (ADR-099)
 *
 * **Primary control — network isolation at ingress/LB (required in production):**
 * All traffic to `/internal/*` paths MUST be blocked at the load-balancer or
 * reverse proxy before it reaches this application. Example rules:
 * - nginx: `location /internal/ { deny all; }`
 * - k8s `NetworkPolicy`: allow only pods in the same namespace
 * - AWS ALB / WAF: path-based rule that returns 403 for `/internal/*` from public CIDRs
 *
 * **Secondary control — shared secret header (defence-in-depth):**
 * This guard checks the `x-internal-secret` request header against
 * `INTERNAL_API_SECRET` from env. It is a defence-in-depth measure —
 * it protects against misconfigured ingress rules but must not be relied
 * upon as the sole barrier. Returns 401 on a missing or mismatched secret.
 *
 * Not used on public routes or Clerk-authenticated routes.
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
