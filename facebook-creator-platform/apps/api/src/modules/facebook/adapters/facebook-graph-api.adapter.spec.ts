import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { FacebookGraphApiAdapter } from './facebook-graph-api.adapter';

const APP_ID = 'test-app-id';
const APP_SECRET = 'test-app-secret';
const REDIRECT_URI = 'http://localhost:3000/api/v1/facebook/callback';

function makeAdapter(): FacebookGraphApiAdapter {
  const config = {
    getOrThrow: (key: string) => {
      const map: Record<string, string> = {
        FACEBOOK_APP_ID: APP_ID,
        FACEBOOK_APP_SECRET: APP_SECRET,
        FACEBOOK_REDIRECT_URI: REDIRECT_URI,
      };
      if (!(key in map)) throw new Error(`Missing env: ${key}`);
      return map[key];
    },
  } as unknown as ConfigService;
  return new FacebookGraphApiAdapter(config);
}

function mockFetch(responses: Array<{ ok: boolean; body: unknown }>): void {
  let callCount = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const resp = responses[callCount++];
      return Promise.resolve({
        ok: resp.ok,
        status: resp.ok ? 200 : 400,
        text: () => Promise.resolve(JSON.stringify(resp.body)),
        json: () => Promise.resolve(resp.body),
      });
    }),
  );
}

describe('FacebookGraphApiAdapter', () => {
  let adapter: FacebookGraphApiAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('exchangeCodeForPages', () => {
    it('returns page data after all three Graph API calls succeed', async () => {
      mockFetch([
        // 1. short-lived token
        { ok: true, body: { access_token: 'short-token', token_type: 'bearer' } },
        // 2. long-lived token
        { ok: true, body: { access_token: 'long-token', expires_in: 5183944 } },
        // 3. /me/accounts
        {
          ok: true,
          body: {
            data: [
              { id: 'page-1', name: 'My Page', access_token: 'page-token-1', expires_in: 5183944 },
            ],
          },
        },
      ]);

      const pages = await adapter.exchangeCodeForPages('auth-code');

      expect(pages).toHaveLength(1);
      expect(pages[0].id).toBe('page-1');
      expect(pages[0].name).toBe('My Page');
      expect(pages[0].accessToken).toBe('page-token-1');
      expect(pages[0].expiresAt).toBeInstanceOf(Date);
    });

    it('returns an empty array when the user manages no pages', async () => {
      mockFetch([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: true, body: { access_token: 'long-token' } },
        { ok: true, body: { data: [] } },
      ]);

      const pages = await adapter.exchangeCodeForPages('auth-code');
      expect(pages).toHaveLength(0);
    });

    it('sets expiresAt to null when the page entry has no expires_in', async () => {
      mockFetch([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: true, body: { access_token: 'long-token' } },
        {
          ok: true,
          body: {
            data: [{ id: 'page-1', name: 'My Page', access_token: 'page-token-1' }],
          },
        },
      ]);

      const pages = await adapter.exchangeCodeForPages('auth-code');
      expect(pages[0].expiresAt).toBeNull();
    });

    it('throws when the short-lived token exchange returns a non-2xx response', async () => {
      mockFetch([
        { ok: false, body: { error: { message: 'Invalid code' } } },
      ]);

      await expect(adapter.exchangeCodeForPages('bad-code')).rejects.toThrow(
        /Facebook token exchange failed/,
      );
    });

    it('throws when the long-lived token exchange returns a non-2xx response', async () => {
      mockFetch([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: false, body: { error: { message: 'Token exchange failed' } } },
      ]);

      await expect(adapter.exchangeCodeForPages('auth-code')).rejects.toThrow(
        /Facebook long-lived token exchange failed/,
      );
    });

    it('throws when the page list call returns a non-2xx response', async () => {
      mockFetch([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: true, body: { access_token: 'long-token' } },
        { ok: false, body: { error: { message: 'Permission denied' } } },
      ]);

      await expect(adapter.exchangeCodeForPages('auth-code')).rejects.toThrow(
        /Facebook page list failed/,
      );
    });
  });
});
