import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchController } from './search.controller';
import { ISearchClient } from './ports/search.client.port';
import { DownstreamServiceError } from '../../common/errors/downstream-service.error';
import type { SearchResultDto } from './dto/search-result.dto';

const makeResult = (overrides: Partial<SearchResultDto> = {}): SearchResultDto => ({
  postId: 'post-1',
  title: 'Hello World',
  content: 'Some content',
  status: 'published',
  workspaceId: 'ws-1',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('SearchController', () => {
  let controller: SearchController;
  let client: ISearchClient;

  beforeEach(() => {
    client = { search: vi.fn() } as unknown as ISearchClient;
    controller = new SearchController(client);
  });

  describe('search', () => {
    it('returns matching results from the search client', async () => {
      vi.mocked(client.search).mockResolvedValue([makeResult()]);

      const result = await controller.search('ws-1', 'hello');

      expect(client.search).toHaveBeenCalledWith('ws-1', 'hello');
      expect(result).toHaveLength(1);
      expect(result[0].postId).toBe('post-1');
      expect(result[0].title).toBe('Hello World');
    });

    it('returns an empty array when no results are found', async () => {
      vi.mocked(client.search).mockResolvedValue([]);

      const result = await controller.search('ws-1', 'nothing');

      expect(result).toHaveLength(0);
    });

    it('defaults q to empty string when not provided', async () => {
      vi.mocked(client.search).mockResolvedValue([]);

      await controller.search('ws-1');

      expect(client.search).toHaveBeenCalledWith('ws-1', '');
    });

    it('throws 503 when the search service is unreachable', async () => {
      vi.mocked(client.search).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3004'),
      );

      await expect(controller.search('ws-1', 'q')).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });

    it('throws 500 for unexpected non-5xx downstream status', async () => {
      vi.mocked(client.search).mockRejectedValue(
        new DownstreamServiceError(404, 'http://localhost:3004'),
      );

      await expect(controller.search('ws-1', 'q')).rejects.toMatchObject({
        response: { code: 'INTERNAL' },
      });
    });
  });
});
