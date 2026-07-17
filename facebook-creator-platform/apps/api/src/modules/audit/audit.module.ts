import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IdentityModule } from '../identity/identity.module';
import { IAuditClient } from './ports/audit-http.client.port';
import { AuditTcpAdapter, AUDIT_TCP_CLIENT } from './adapters/audit-tcp.adapter';
import { AuditController } from './audit.controller';

/**
 * Thin proxy module in `apps/api` for audit-log read operations.
 *
 * Owns NO entities or migrations — all audit data lives in `services/audit` (MongoDB).
 * Responsibilities:
 * 1. Expose `GET /workspaces/:id/audit-logs` and `GET /workspaces/:id/audit-logs/:auditId`
 *    with Clerk JWT auth + Owner-only workspace role guard.
 * 2. Forward requests to `services/audit` via `IAuditClient` → `AuditTcpAdapter`
 *    over TCP (ADR-094 Three-Transport Model — replaces HTTP in TM.11).
 *
 * Port bindings:
 * - `IAuditClient` → `AuditTcpAdapter` (TCP RPC on `AUDIT_TCP_HOST:AUDIT_TCP_PORT`)
 */
@Module({
  imports: [
    IdentityModule,
    ClientsModule.registerAsync([
      {
        name: AUDIT_TCP_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUDIT_TCP_HOST', 'localhost'),
            port: config.get<number>('AUDIT_TCP_PORT', 3003),
          },
        }),
      },
    ]),
  ],
  controllers: [AuditController],
  providers: [
    AuditTcpAdapter,
    { provide: IAuditClient, useClass: AuditTcpAdapter },
  ],
})
export class AuditModule {}
