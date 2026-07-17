import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { RpcException } from '@nestjs/microservices';
import { AuditMessageController } from './audit.message-controller';
import { AuditService } from './audit.service';
import { AppError } from './common/app-error';
import type { AuditEvent } from './entities/audit-event.entity';

const mockService = {
  getWorkspaceAuditLogs: vi.fn(),
  getAuditEvent: vi.fn(),
} as unknown as AuditService;

const makeEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent =>
  ({
    _id: 'evt-id-1',
    eventId: 'domain-evt-1',
    routingKey: 'posts.published',
    workspaceId: 'ws-1',
    payload: { postId: 'p-1' },
    receivedAt: new Date('2026-07-17T00:00:00Z'),
    ...overrides,
  }) as AuditEvent;

describe('AuditMessageController', () => {
  let controller: AuditMessageController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuditMessageController(mockService);
  });

  // ---------------------------------------------------------------------------
  // audit.get-logs
  // ---------------------------------------------------------------------------

  describe('getWorkspaceAuditLogs', () => {
    it('returns AuditEvent[] from AuditService', async () => {
      vi.mocked(mockService.getWorkspaceAuditLogs).mockResolvedValue(ok([makeEvent()]));

      const result = await controller.getWorkspaceAuditLogs({ workspaceId: 'ws-1' });

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('evt-id-1');
      expect(mockService.getWorkspaceAuditLogs).toHaveBeenCalledWith('ws-1', {
        limit: undefined,
        before: undefined,
      });
    });

    it('returns empty array when no events exist', async () => {
      vi.mocked(mockService.getWorkspaceAuditLogs).mockResolvedValue(ok([]));

      const result = await controller.getWorkspaceAuditLogs({ workspaceId: 'ws-none' });

      expect(result).toEqual([]);
    });

    it('converts before ISO string to Date before forwarding', async () => {
      vi.mocked(mockService.getWorkspaceAuditLogs).mockResolvedValue(ok([]));

      await controller.getWorkspaceAuditLogs({
        workspaceId: 'ws-1',
        limit: 10,
        before: '2026-07-17T00:00:00Z',
      });

      expect(mockService.getWorkspaceAuditLogs).toHaveBeenCalledWith('ws-1', {
        limit: 10,
        before: new Date('2026-07-17T00:00:00Z'),
      });
    });

    it('throws RpcException on repository failure', async () => {
      vi.mocked(mockService.getWorkspaceAuditLogs).mockRejectedValue(new Error('MongoDB down'));

      await expect(
        controller.getWorkspaceAuditLogs({ workspaceId: 'ws-1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });

  // ---------------------------------------------------------------------------
  // audit.get-log
  // ---------------------------------------------------------------------------

  describe('getAuditEvent', () => {
    it('returns AuditEvent when the document exists', async () => {
      const event = makeEvent();
      vi.mocked(mockService.getAuditEvent).mockResolvedValue(ok(event));

      const result = await controller.getAuditEvent({ id: 'evt-id-1' });

      expect(result._id).toBe('evt-id-1');
      expect(mockService.getAuditEvent).toHaveBeenCalledWith('evt-id-1');
    });

    it('throws RpcException(NOT_FOUND) when the document does not exist', async () => {
      vi.mocked(mockService.getAuditEvent).mockResolvedValue(
        err(AppError.notFound('AuditEvent missing-id')),
      );

      const promise = controller.getAuditEvent({ id: 'missing-id' });

      await expect(promise).rejects.toBeInstanceOf(RpcException);
      try {
        await controller.getAuditEvent({ id: 'missing-id' });
      } catch (e) {
        expect(e instanceof RpcException && (e.getError() as { code: string }).code).toBe(
          'NOT_FOUND',
        );
      }
    });

    it('throws RpcException(INTERNAL) on repository failure', async () => {
      vi.mocked(mockService.getAuditEvent).mockRejectedValue(new Error('MongoDB timeout'));

      await expect(
        controller.getAuditEvent({ id: 'evt-id-1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });
});
