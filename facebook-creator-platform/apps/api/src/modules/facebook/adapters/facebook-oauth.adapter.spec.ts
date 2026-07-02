import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FacebookOAuthAdapter } from './facebook-oauth.adapter';

const APP_ID = 'test-app-id';
const APP_SECRET = 'test-app-secret';
const REDIRECT_URI = 'http://localhost:3000/api/v1/facebook/callback';

function makeAdapter(): FacebookOAuthAdapter {
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
  return new FacebookOAuthAdapter(config);
}

describe('FacebookOAuthAdapter', () => {
  let adapter: FacebookOAuthAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  describe('buildConnectUrl', () => {
    it('returns a url pointing to the Facebook OAuth dialog on v25.0', () => {
      const { url } = adapter.buildConnectUrl('ws-1');
      expect(url).toContain('https://www.facebook.com/v25.0/dialog/oauth');
    });

    it('includes the app id, redirect_uri, and required scopes in the url', () => {
      const { url } = adapter.buildConnectUrl('ws-1');
      const parsed = new URL(url);
      expect(parsed.searchParams.get('client_id')).toBe(APP_ID);
      expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
      expect(parsed.searchParams.get('scope')).toContain('pages_manage_posts');
      expect(parsed.searchParams.get('scope')).toContain('pages_read_engagement');
      expect(parsed.searchParams.get('scope')).toContain('pages_show_list');
    });

    it('includes the state in the url', () => {
      const { url, state } = adapter.buildConnectUrl('ws-1');
      const parsed = new URL(url);
      expect(parsed.searchParams.get('state')).toBe(state);
    });

    it('state has the format <base64url-payload>.<hex-hmac>', () => {
      const { state } = adapter.buildConnectUrl('ws-1');
      const parts = state.split('.');
      expect(parts).toHaveLength(2);
      const [payload, sig] = parts;
      expect(payload.length).toBeGreaterThan(0);
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it('state payload decodes to an object with workspaceId and nonce', () => {
      const { state } = adapter.buildConnectUrl('ws-99');
      const [payload] = state.split('.');
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      expect(decoded.workspaceId).toBe('ws-99');
      expect(typeof decoded.nonce).toBe('string');
      expect(decoded.nonce).toHaveLength(32);
    });

    it('state HMAC is verifiable with the app secret', () => {
      const { state } = adapter.buildConnectUrl('ws-1');
      const [payload, sig] = state.split('.');
      const expected = createHmac('sha256', APP_SECRET).update(payload).digest('hex');
      expect(sig).toBe(expected);
    });

    it('generates a unique state on each call (nonce differs)', () => {
      const { state: s1 } = adapter.buildConnectUrl('ws-1');
      const { state: s2 } = adapter.buildConnectUrl('ws-1');
      expect(s1).not.toBe(s2);
    });
  });

  describe('verifyState', () => {
    it('returns true for a valid state with the correct workspaceId', () => {
      const { state } = adapter.buildConnectUrl('ws-100');
      expect(adapter.verifyState(state, 'ws-100')).toBe(true);
    });

    it('returns false when the HMAC signature has been tampered with', () => {
      const { state } = adapter.buildConnectUrl('ws-1');
      const tampered = state.slice(0, -4) + 'beef'; // corrupt last 4 hex chars
      expect(adapter.verifyState(tampered, 'ws-1')).toBe(false);
    });

    it('returns false when the workspaceId in the state does not match the expected one', () => {
      const { state } = adapter.buildConnectUrl('ws-1');
      expect(adapter.verifyState(state, 'ws-2')).toBe(false);
    });

    it('returns false for a malformed state with no dot separator', () => {
      expect(adapter.verifyState('notavalidstate', 'ws-1')).toBe(false);
    });
  });

  describe('extractWorkspaceId', () => {
    it('returns the workspaceId from a valid state without checking the HMAC', () => {
      const { state } = adapter.buildConnectUrl('ws-extract-test');
      expect(adapter.extractWorkspaceId(state)).toBe('ws-extract-test');
    });

    it('returns null for a state with no dot separator', () => {
      expect(adapter.extractWorkspaceId('nodot')).toBeNull();
    });

    it('returns null when the payload is not valid base64url JSON', () => {
      expect(adapter.extractWorkspaceId('!!!.sig')).toBeNull();
    });
  });
});
