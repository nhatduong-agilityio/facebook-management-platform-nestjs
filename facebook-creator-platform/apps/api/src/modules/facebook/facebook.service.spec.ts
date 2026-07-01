import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FacebookService } from './facebook.service';
import { IFacebookOAuthProvider } from './ports/facebook-oauth.provider.port';

const mockOAuthProvider = {
  buildConnectUrl: vi.fn(),
} as unknown as IFacebookOAuthProvider;

describe('FacebookService', () => {
  let service: FacebookService;

  beforeEach(() => {
    service = new FacebookService(mockOAuthProvider);
    vi.clearAllMocks();
  });

  describe('getConnectUrl', () => {
    it('returns ok({ url, state }) on the happy path', () => {
      const connectUrl = {
        url: 'https://www.facebook.com/v21.0/dialog/oauth?client_id=123&state=abc',
        state: 'abc.sig',
      };
      vi.mocked(mockOAuthProvider.buildConnectUrl).mockReturnValue(connectUrl);

      const result = service.getConnectUrl('ws-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(connectUrl);
    });

    it('passes workspaceId to the provider', () => {
      vi.mocked(mockOAuthProvider.buildConnectUrl).mockReturnValue({ url: 'http://x', state: 's' });

      service.getConnectUrl('ws-42');

      expect(mockOAuthProvider.buildConnectUrl).toHaveBeenCalledWith('ws-42');
    });
  });
});
