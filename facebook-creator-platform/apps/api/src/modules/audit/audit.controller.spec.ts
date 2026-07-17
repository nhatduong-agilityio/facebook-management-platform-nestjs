import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditController } from './audit.controller';
import { IAuditClient } from './ports/audit-http.client.port';
import { DownstreamServiceError } from '../../common/errors/downstream-service.error';
import type { AuditLogResponseDto } from './dto/audit-log.dto';

const makeEvent = (overrides: Partial<AuditLogResponseDto> = {}): AuditLogResponseDto => ({
  _id: 'audit-id-1',
  eventId: 'event-id-1',
  routingKey: 'posts.published',
  workspaceId: 'ws-1',
  payload: { postId: 'p-1' },
  receivedAt: new Date('2026-07-06T00:00:00Z'),
  ...overrides,
});

describe('AuditController', () => {
  let controller: AuditController;
  let client: IAuditClient;

  beforeEach(() => {
    client = {
      getWorkspaceAuditLogs: vi.fn(),
      getAuditEvent: vi.fn(),
    } as unknown as IAuditClient;
    controller = new AuditController(client);
  });

  describe('getWorkspaceAuditLogs', () => {
    it('returns events from the audit client', async () => {
      const events = [makeEvent(), makeEvent({ _id: 'audit-id-2' })];
      vi.mocked(client.getWorkspaceAuditLogs).mockResolvedValue(events);

      const result = await controller.getWorkspaceAuditLogs('ws-1');

      expect(client.getWorkspaceAuditLogs).toHaveBeenCalledWith('ws-1', undefined);
      expect(result).toEqual(events);
    });

    it('caps limit at 200 before forwarding to the client', async () => {
      vi.mocked(client.getWorkspaceAuditLogs).mockResolvedValue([]);

      await controller.getWorkspaceAuditLogs('ws-1', '500');

      expect(client.getWorkspaceAuditLogs).toHaveBeenCalledWith('ws-1', 200);
    });

    it('throws 503 when the audit service is unreachable', async () => {
      vi.mocked(client.getWorkspaceAuditLogs).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3003'),
      );

      await expect(controller.getWorkspaceAuditLogs('ws-1')).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });
  });

  describe('getAuditEvent', () => {
    it('returns the event when the client finds it', async () => {
      const event = makeEvent();
      vi.mocked(client.getAuditEvent).mockResolvedValue(event);

      const result = await controller.getAuditEvent('audit-id-1');

      expect(client.getAuditEvent).toHaveBeenCalledWith('audit-id-1');
      expect(result).toEqual(event);
    });

    it('throws NotFoundException when the client returns null', async () => {
      vi.mocked(client.getAuditEvent).mockResolvedValue(null);

      await expect(controller.getAuditEvent('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 503 when the audit service is unreachable', async () => {
      vi.mocked(client.getAuditEvent).mockRejectedValue(
        new DownstreamServiceError(503, 'http://localhost:3003'),
      );

      await expect(controller.getAuditEvent('some-id')).rejects.toMatchObject({
        response: { code: 'SERVICE_UNAVAILABLE' },
      });
    });
  });
});
