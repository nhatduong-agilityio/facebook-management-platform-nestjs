import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { FacebookWebhookController } from './facebook-webhook.controller';
import { FacebookService, type FacebookWebhookPayload } from './facebook.service';
import { AppError } from '../../common/errors/app-error';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

const makeReq = (rawBody?: Buffer): RawBodyRequest<Request> =>
  ({ rawBody } as RawBodyRequest<Request>);

describe('FacebookWebhookController', () => {
  let controller: FacebookWebhookController;
  let service: FacebookService;

  beforeEach(() => {
    service = {
      processWebhookPayload: vi.fn(),
      verifyWebhookChallenge: vi.fn(),
    } as unknown as FacebookService;
    controller = new FacebookWebhookController(service);
  });

  describe('handleWebhookEvent (POST)', () => {
    const payload: FacebookWebhookPayload = {
      object: 'page',
      entry: [],
    };

    it('processes valid webhook events without throwing', async () => {
      vi.mocked(service.processWebhookPayload).mockResolvedValue(ok(undefined));
      const req = makeReq(Buffer.from('{}'));

      await expect(
        controller.handleWebhookEvent('sha256=valid', req, payload),
      ).resolves.toBeUndefined();
    });

    it('throws 403 when HMAC signature is invalid', async () => {
      vi.mocked(service.processWebhookPayload).mockResolvedValue(err(AppError.forbidden('Bad signature')));

      await expect(
        controller.handleWebhookEvent('sha256=bad', makeReq(), payload),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    });

    it('falls back to empty Buffer when rawBody is undefined', async () => {
      vi.mocked(service.processWebhookPayload).mockResolvedValue(ok(undefined));
      const req = makeReq(undefined);

      await controller.handleWebhookEvent('sha256=valid', req, payload);

      const [rawBodyArg] = vi.mocked(service.processWebhookPayload).mock.calls[0];
      expect(rawBodyArg).toBeInstanceOf(Buffer);
      expect(rawBodyArg.length).toBe(0);
    });
  });

  describe('verifyChallenge (GET)', () => {
    it('returns the challenge string on success', () => {
      vi.mocked(service.verifyWebhookChallenge).mockReturnValue(ok('abc123'));

      const result = controller.verifyChallenge('subscribe', 'my-verify-token', 'abc123');

      expect(result).toBe('abc123');
    });

    it('throws 403 when verify_token does not match', () => {
      vi.mocked(service.verifyWebhookChallenge).mockReturnValue(err(AppError.forbidden('Token mismatch')));

      expect(() =>
        controller.verifyChallenge('subscribe', 'wrong-token', 'nonce'),
      ).toThrow();
    });
  });
});
