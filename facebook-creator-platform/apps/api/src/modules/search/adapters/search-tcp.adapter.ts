import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ISearchClient } from '../ports/search.client.port';
import { DownstreamServiceError } from '../../../common/http/http-client.port';
import type { SearchResultDto } from '../dto/search-result.dto';

/** DI token for the search TCP `ClientProxy`. */
export const SEARCH_TCP_CLIENT = 'SEARCH_TCP_CLIENT';

/** Milliseconds before a TCP RPC call is abandoned and a 503 is surfaced. */
const TCP_TIMEOUT_MS = 3_000;

/**
 * `ISearchClient` implementation backed by NestJS TCP transport (ADR-094).
 *
 * Replaces `SearchHttpClientAdapter` as the concrete adapter for sync search
 * calls from `apps/api` to `services/search`. Error mapping preserves the same
 * `DownstreamServiceError` contract so `SearchController` requires no changes.
 *
 * Error mapping:
 * - Any `RpcException` → `DownstreamServiceError(500)`
 * - Timeout / connection refused → `DownstreamServiceError(503)`
 */
@Injectable()
export class SearchTcpAdapter extends ISearchClient {
  /** @param client - NestJS `ClientProxy` bound to the search TCP transport. */
  constructor(@Inject(SEARCH_TCP_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  /**
   * Executes a full-text search over posts via TCP.
   *
   * Pattern: `search.query` — payload `{ workspaceId, query }` → `SearchResultDto[]`.
   *
   * @param workspaceId - UUID of the workspace (Algolia filter).
   * @param query       - The search term(s).
   * @returns Array of matching post records from the Algolia index.
   * @throws {DownstreamServiceError} on TCP failure or service error.
   */
  async search(workspaceId: string, query: string): Promise<SearchResultDto[]> {
    try {
      return await firstValueFrom(
        this.client
          .send<SearchResultDto[]>('search.query', { workspaceId, query })
          .pipe(timeout(TCP_TIMEOUT_MS)),
      );
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * Maps a TCP error to a `DownstreamServiceError` so callers retain the same
   * error-handling contract they had with `SearchHttpClientAdapter`.
   */
  private mapError(e: unknown): DownstreamServiceError {
    if (e instanceof RpcException) {
      return new DownstreamServiceError(500, 'search');
    }
    return new DownstreamServiceError(503, 'search');
  }
}
