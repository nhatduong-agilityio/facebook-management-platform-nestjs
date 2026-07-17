import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { SearchTcpAdapter } from './search-tcp.adapter';
import { DownstreamServiceError } from '../../../common/http/http-client.port';
import type { SearchResultDto } from '../dto/search-result.dto';

const makeResult = (): SearchResultDto => ({
  postId: 'post-1',
  workspaceId: 'ws-1',
  title: 'Hello World',
  content: 'Some content',
  status: 'published',
  createdAt: '2026-07-17T00:00:00Z',
});

describe('SearchTcpAdapter', () => {
  let adapter: SearchTcpAdapter;
  let client: ClientProxy;

  beforeEach(() => {
    client = { send: vi.fn() } as unknown as ClientProxy;
    adapter = new SearchTcpAdapter(client);
  });

  describe('search', () => {
    it('returns SearchResultDto[] from the search service', async () => {
      vi.mocked(client.send).mockReturnValue(of([makeResult()]));

      const result = await adapter.search('ws-1', 'hello');

      expect(result).toHaveLength(1);
      expect(result[0].postId).toBe('post-1');
      expect(client.send).toHaveBeenCalledWith('search.query', {
        workspaceId: 'ws-1',
        query: 'hello',
      });
    });

    it('returns an empty array when no results are found', async () => {
      vi.mocked(client.send).mockReturnValue(of([]));

      const result = await adapter.search('ws-1', 'nothing');

      expect(result).toEqual([]);
    });

    it('throws DownstreamServiceError(500) on RpcException', async () => {
      vi.mocked(client.send).mockReturnValue(
        throwError(() => new RpcException({ code: 'INTERNAL', message: 'Algolia error' })),
      );

      await expect(adapter.search('ws-1', 'hello')).rejects.toMatchObject({ status: 500 });
    });

    it('throws DownstreamServiceError(503) on TCP timeout or connection failure', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await expect(adapter.search('ws-1', 'hello')).rejects.toBeInstanceOf(DownstreamServiceError);
      await expect(adapter.search('ws-1', 'hello')).rejects.toMatchObject({ status: 503 });
    });
  });
});
