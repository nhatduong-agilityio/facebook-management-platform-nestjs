import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { SearchMessageController } from './search.message-controller';
import { SearchService } from './search.service';
import type { SearchResultDto } from './dto/search-result.dto';

const mockSearch = {
  search: vi.fn(),
} as unknown as SearchService;

describe('SearchMessageController', () => {
  let controller: SearchMessageController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SearchMessageController(mockSearch);
  });

  describe('search', () => {
    it('returns SearchResultDto[] from SearchService', async () => {
      const results: SearchResultDto[] = [
        {
          postId: 'post-1',
          workspaceId: 'ws-1',
          content: 'Hello world',
          status: 'published',
          createdAt: '2026-07-17T00:00:00Z',
        },
      ];
      vi.mocked(mockSearch.search).mockResolvedValue(results);

      const result = await controller.search({ workspaceId: 'ws-1', query: 'hello' });

      expect(result).toHaveLength(1);
      expect(result[0].postId).toBe('post-1');
      expect(mockSearch.search).toHaveBeenCalledWith('ws-1', 'hello');
    });

    it('throws RpcException on Algolia failure', async () => {
      vi.mocked(mockSearch.search).mockRejectedValue(new Error('Algolia timeout'));

      await expect(
        controller.search({ workspaceId: 'ws-1', query: 'hello' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });
});
