import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { BillingTcpAdapter } from './billing-tcp.adapter';
import { DownstreamServiceError } from '../../../common/errors/downstream-service.error';
import type { SubscriptionResponse, CheckoutResponse } from '@fcp/billing-contracts';

const makeSubscriptionResponse = (): SubscriptionResponse => ({
  id: 'sub-1',
  workspaceId: 'ws-1',
  status: 'active',
  plan: { code: 'pro', name: 'Pro', postLimit: 500 },
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  gracePeriodEnd: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('BillingTcpAdapter', () => {
  let adapter: BillingTcpAdapter;
  let client: ClientProxy;

  beforeEach(() => {
    client = { send: vi.fn() } as unknown as ClientProxy;
    adapter = new BillingTcpAdapter(client);
  });

  // ---------------------------------------------------------------------------
  // getPostLimit
  // ---------------------------------------------------------------------------

  describe('getPostLimit', () => {
    it('returns the post limit from the billing service', async () => {
      vi.mocked(client.send).mockReturnValue(of({ postLimit: 500 }));

      const result = await adapter.getPostLimit('ws-1');

      expect(result).toBe(500);
      expect(client.send).toHaveBeenCalledWith('billing.get-quota', { workspaceId: 'ws-1' });
    });

    it('throws DownstreamServiceError(503) on connection failure', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await expect(adapter.getPostLimit('ws-1')).rejects.toBeInstanceOf(DownstreamServiceError);
      await expect(adapter.getPostLimit('ws-1')).rejects.toMatchObject({ status: 503 });
    });
  });

  // ---------------------------------------------------------------------------
  // getSubscription
  // ---------------------------------------------------------------------------

  describe('getSubscription', () => {
    it('returns SubscriptionResponse from the billing service', async () => {
      const sub = makeSubscriptionResponse();
      vi.mocked(client.send).mockReturnValue(of(sub));

      const result = await adapter.getSubscription('ws-1');

      expect(result.id).toBe('sub-1');
      expect(result.plan.code).toBe('pro');
      expect(client.send).toHaveBeenCalledWith('billing.get-subscription', { workspaceId: 'ws-1' });
    });

    it('throws DownstreamServiceError(404) when service returns NOT_FOUND RpcException', async () => {
      vi.mocked(client.send).mockReturnValue(
        throwError(() => new RpcException({ code: 'NOT_FOUND', message: 'No subscription' })),
      );

      await expect(adapter.getSubscription('ws-none')).rejects.toMatchObject({ status: 404 });
    });

    it('throws DownstreamServiceError(503) on TCP timeout or connection error', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('timeout')));

      await expect(adapter.getSubscription('ws-1')).rejects.toMatchObject({ status: 503 });
    });
  });

  // ---------------------------------------------------------------------------
  // createCheckoutSession
  // ---------------------------------------------------------------------------

  describe('createCheckoutSession', () => {
    it('returns CheckoutResponse from the billing service', async () => {
      const response: CheckoutResponse = { url: 'https://checkout.stripe.com/pay/cs_test_123' };
      vi.mocked(client.send).mockReturnValue(of(response));

      const result = await adapter.createCheckoutSession({ workspaceId: 'ws-1', planCode: 'pro' });

      expect(result.url).toContain('stripe.com');
      expect(client.send).toHaveBeenCalledWith('billing.checkout', {
        workspaceId: 'ws-1',
        planCode: 'pro',
      });
    });

    it('throws DownstreamServiceError(503) when the billing service is unreachable', async () => {
      vi.mocked(client.send).mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await expect(
        adapter.createCheckoutSession({ workspaceId: 'ws-1', planCode: 'pro' }),
      ).rejects.toMatchObject({ status: 503 });
    });
  });
});
