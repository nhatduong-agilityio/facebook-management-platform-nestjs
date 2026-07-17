import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IdentityModule } from '../identity/identity.module';
import { ISearchClient } from './ports/search.client.port';
import { SearchTcpAdapter, SEARCH_TCP_CLIENT } from './adapters/search-tcp.adapter';
import { SearchController } from './search.controller';

/**
 * Thin proxy module in `apps/api` for post-search operations.
 *
 * Owns NO entities, migrations, or Algolia SDK imports — all search index writes
 * happen in `services/search` (driven by RabbitMQ consumers). This module:
 * 1. Exposes `GET /workspaces/:workspaceId/search?q=` with Clerk JWT + any-role guard.
 * 2. Forwards requests to `services/search` via `ISearchClient → SearchTcpAdapter`
 *    (NestJS TCP transport, ADR-094).
 *
 * Communication:
 * - Sync TCP (`SEARCH_TCP_CLIENT`) to `services/search` for search queries.
 *
 * Port bindings:
 * - `ISearchClient` → `SearchTcpAdapter` (TCP RPC, replaces HTTP adapter — ADR-094)
 */
@Module({
  imports: [
    IdentityModule,
    ClientsModule.registerAsync([
      {
        name: SEARCH_TCP_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('SEARCH_TCP_HOST', 'localhost'),
            port: config.get<number>('SEARCH_TCP_PORT', 4004),
          },
        }),
      },
    ]),
  ],
  controllers: [SearchController],
  providers: [
    SearchTcpAdapter,
    { provide: ISearchClient, useClass: SearchTcpAdapter },
  ],
})
export class SearchModule {}
