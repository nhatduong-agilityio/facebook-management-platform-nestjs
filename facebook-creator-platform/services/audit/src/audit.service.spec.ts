import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from './audit.service';
import { IAuditEventRepository } from './ports/audit-event.repository.port';
import { AuditEvent } from './entities/audit-event.entity';

const mockRepo = {
  insert: vi.fn(),
  findByWorkspace: vi.fn(),
  findById: vi.fn(),
} as unknown as IAuditEventRepository;

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService(mockRepo);
    vi.clearAllMocks();
  });

  describe('getWorkspaceAuditLogs', () => {
    it('returns ok(events) for a workspace', async () => {
      const events = [{ _id: 'id-1', eventId: 'evt-1', routingKey: 'posts.published' }] as AuditEvent[];
      vi.mocked(mockRepo.findByWorkspace).mockResolvedValue(events);

      const result = await service.getWorkspaceAuditLogs('ws-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(events);
      expect(mockRepo.findByWorkspace).toHaveBeenCalledWith('ws-1', undefined);
    });

    it('returns ok([]) when no events exist for the workspace', async () => {
      vi.mocked(mockRepo.findByWorkspace).mockResolvedValue([]);

      const result = await service.getWorkspaceAuditLogs('ws-unknown');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });
  });

  describe('getAuditEvent', () => {
    it('returns ok(event) when the document exists', async () => {
      const event = { _id: 'id-1', eventId: 'evt-1' } as AuditEvent;
      vi.mocked(mockRepo.findById).mockResolvedValue(event);

      const result = await service.getAuditEvent('id-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(event);
    });

    it('returns err(NOT_FOUND) when the document does not exist', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const result = await service.getAuditEvent('missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });
});
