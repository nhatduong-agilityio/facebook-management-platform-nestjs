import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IHttpClient } from '../../common/http/http-client.port';
import { FetchHttpClientAdapter } from '../../common/http/fetch-http-client.adapter';
import { IAuditClient } from './ports/audit-http.client.port';
import { AuditHttpClientAdapter } from './adapters/audit-http-client.adapter';
import { AuditController } from './audit.controller';

/**
 * Thin proxy module in `apps/api` for audit-log read operations.
 *
 * Owns NO entities or migrations — all audit data lives in `services/audit` (MongoDB).
 * Responsibilities:
 * 1. Expose `GET /workspaces/:id/audit-logs` and `GET /workspaces/:id/audit-logs/:auditId`
 *    with Clerk JWT auth + Owner-only workspace role guard.
 * 2. Forward requests to `services/audit` via `IAuditClient` → `AuditHttpClientAdapter`
 *    (backed by `IHttpClient` → `FetchHttpClientAdapter` with 5s timeout).
 *
 * Port bindings:
 * - `IHttpClient`  → `FetchHttpClientAdapter` (native fetch, 5 s timeout)
 * - `IAuditClient` → `AuditHttpClientAdapter`  (maps raw service shape → `AuditLogResponseDto`)
 */
@Module({
  imports: [IdentityModule],
  controllers: [AuditController],
  providers: [
    { provide: IHttpClient, useClass: FetchHttpClientAdapter },
    { provide: IAuditClient, useClass: AuditHttpClientAdapter },
  ],
})
export class AuditModule {}
