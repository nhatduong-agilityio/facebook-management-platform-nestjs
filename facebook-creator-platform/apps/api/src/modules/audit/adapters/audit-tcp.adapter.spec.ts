import { describe, it, expect, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { AuditTcpAdapter, AUDIT_TCP_CLIENT } from './audit-tcp.adapter';
import { DownstreamServiceError } from '../../../common/http/http-client.port';
import type { ClientProxy } from '@nestjs/microservices';

const RAW_EVENT = {
  _id: 'evt-1',
  eventId: 'domain-1',
  routingKey: 'posts.published',
  workspaceId: 'ws-1',
  payload: { postId: 'p-1' },
  receivedAt: '2026-07-17T00:00:00.000Z',
};

function makeClient(returnValue: unknown): ClientProxy {
  return {
    send: vi.fn().mockReturnValue(of(returnValue)),
  } as unknown as ClientProxy;
}

function makeThrowingClient(error: unknown): ClientProxy {
  return {
    send: vi.fn().mockReturnValue(throwError(() => error)),
  } as unknown as ClientProxy;
}

function buildAdapter(client: ClientProxy): AuditTcpAdapter {
  const adapter = new AuditTcpAdapter(client);
  Reflect.set(adapter, AUDIT_TCP_CLIENT, client);
  return adapter;
}

describe('AuditTcpAdapter', () => {
  // ---------------------------------------------------------------------------
  // getWorkspaceAuditLogs
  // ---------------------------------------------------------------------------

  describe('getWorkspaceAuditLogs', () => {
    it('returns mapped AuditLogResponseDto[] on success', async () => {
      const client = makeClient([RAW_EVENT]);
      const adapter = buildAdapter(client);

      const result = await adapter.getWorkspaceAuditLogs('ws-1', 10);

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('evt-1');
      expect(result[0].receivedAt).toBeInstanceOf(Date);
    });

    it('returns empty array when audit service returns []', async () => {
      const client = makeClient([]);
      const adapter = buildAdapter(client);

      const result = await adapter.getWorkspaceAuditLogs('ws-empty');

      expect(result).toEqual([]);
    });

    it('throws DownstreamServiceError(500) on RpcException', async () => {
      const client = makeThrowingClient(new RpcException({ code: 'INTERNAL', message: 'DB error' }));
      const adapter = buildAdapter(client);

      await expect(adapter.getWorkspaceAuditLogs('ws-1')).rejects.toBeInstanceOf(DownstreamServiceError);

      try {
        await adapter.getWorkspaceAuditLogs('ws-1');
      } catch (e) {
        expect((e as DownstreamServiceError).status).toBe(500);
      }
    });

    it('throws DownstreamServiceError(503) on connection error', async () => {
      const connErr = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const client = makeThrowingClient(connErr);
      const adapter = buildAdapter(client);

      try {
        await adapter.getWorkspaceAuditLogs('ws-1');
      } catch (e) {
        expect((e as DownstreamServiceError).status).toBe(503);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getAuditEvent
  // ---------------------------------------------------------------------------

  describe('getAuditEvent', () => {
    it('returns mapped AuditLogResponseDto on success', async () => {
      const client = makeClient(RAW_EVENT);
      const adapter = buildAdapter(client);

      const result = await adapter.getAuditEvent('evt-1');

      expect(result).not.toBeNull();
      expect(result!._id).toBe('evt-1');
      expect(result!.receivedAt).toBeInstanceOf(Date);
    });

    it('returns null when RpcException code is NOT_FOUND', async () => {
      const client = makeThrowingClient(new RpcException({ code: 'NOT_FOUND', message: 'not found' }));
      const adapter = buildAdapter(client);

      const result = await adapter.getAuditEvent('missing');

      expect(result).toBeNull();
    });

    it('throws DownstreamServiceError(500) on RpcException with code INTERNAL', async () => {
      const client = makeThrowingClient(new RpcException({ code: 'INTERNAL', message: 'fail' }));
      const adapter = buildAdapter(client);

      try {
        await adapter.getAuditEvent('evt-1');
      } catch (e) {
        expect(e).toBeInstanceOf(DownstreamServiceError);
        expect((e as DownstreamServiceError).status).toBe(500);
      }
    });

    it('throws DownstreamServiceError(503) on connection error', async () => {
      const connErr = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const client = makeThrowingClient(connErr);
      const adapter = buildAdapter(client);

      try {
        await adapter.getAuditEvent('evt-1');
      } catch (e) {
        expect(e).toBeInstanceOf(DownstreamServiceError);
        expect((e as DownstreamServiceError).status).toBe(503);
      }
    });
  });
});
