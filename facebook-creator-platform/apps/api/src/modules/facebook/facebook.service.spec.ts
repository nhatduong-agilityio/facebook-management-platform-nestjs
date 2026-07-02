import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FacebookService } from './facebook.service';
import { IFacebookOAuthProvider } from './ports/facebook-oauth.provider.port';
import { IFacebookGraphApiProvider } from './ports/facebook-graph-api.provider.port';
import { IFacebookAccountRepository } from './ports/facebook-account.repository.port';
import type { FacebookAccount } from './entities/facebook-account.entity';

const mockOAuthProvider = {
  buildConnectUrl: vi.fn(),
  verifyState: vi.fn(),
  extractWorkspaceId: vi.fn(),
} as unknown as IFacebookOAuthProvider;

const mockGraphApi = {
  exchangeCodeForPages: vi.fn(),
} as unknown as IFacebookGraphApiProvider;

const mockFacebookAccounts = {
  findByPageId: vi.fn(),
  connectPage: vi.fn(),
} as unknown as IFacebookAccountRepository;

describe('FacebookService', () => {
  let service: FacebookService;

  beforeEach(() => {
    service = new FacebookService(mockOAuthProvider, mockGraphApi, mockFacebookAccounts);
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

  describe('connectPage', () => {
    const WORKSPACE_ID = 'ws-001';
    const CODE = 'oauth-code-123';
    const STATE = 'valid.state';

    const fakePage = { id: 'page-1', name: 'My Page', accessToken: 'tok', expiresAt: null };

    const fakeAccount = {
      id: 'acc-uuid-1',
      pageId: 'page-1',
      pageName: 'My Page',
      connectedAt: new Date('2026-07-02T00:00:00Z'),
    } as unknown as FacebookAccount;

    it('returns ok with page metadata when state is valid and pages exist', async () => {
      vi.mocked(mockOAuthProvider.verifyState).mockReturnValue(true);
      vi.mocked(mockGraphApi.exchangeCodeForPages).mockResolvedValue([fakePage]);
      vi.mocked(mockFacebookAccounts.connectPage).mockResolvedValue(fakeAccount);

      const result = await service.connectPage(WORKSPACE_ID, CODE, STATE);

      expect(result.isOk()).toBe(true);
      const pages = result._unsafeUnwrap();
      expect(pages).toHaveLength(1);
      expect(pages[0].pageId).toBe('page-1');
      expect(pages[0].pageName).toBe('My Page');
      expect(pages[0]).not.toHaveProperty('accessToken');
    });

    it('returns err(CROSS_WORKSPACE) when the state HMAC is invalid', async () => {
      vi.mocked(mockOAuthProvider.verifyState).mockReturnValue(false);

      const result = await service.connectPage(WORKSPACE_ID, CODE, 'tampered.state');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CROSS_WORKSPACE');
      expect(mockGraphApi.exchangeCodeForPages).not.toHaveBeenCalled();
    });

    it('returns err(CROSS_WORKSPACE) when the state workspaceId does not match', async () => {
      vi.mocked(mockOAuthProvider.verifyState).mockReturnValue(false);

      const result = await service.connectPage('ws-different', CODE, STATE);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CROSS_WORKSPACE');
    });

    it('returns err(NOT_FOUND) when the Graph API returns no pages', async () => {
      vi.mocked(mockOAuthProvider.verifyState).mockReturnValue(true);
      vi.mocked(mockGraphApi.exchangeCodeForPages).mockResolvedValue([]);

      const result = await service.connectPage(WORKSPACE_ID, CODE, STATE);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
      expect(mockFacebookAccounts.connectPage).not.toHaveBeenCalled();
    });

    it('passes workspaceId and page data to the repository', async () => {
      vi.mocked(mockOAuthProvider.verifyState).mockReturnValue(true);
      vi.mocked(mockGraphApi.exchangeCodeForPages).mockResolvedValue([fakePage]);
      vi.mocked(mockFacebookAccounts.connectPage).mockResolvedValue(fakeAccount);

      await service.connectPage(WORKSPACE_ID, CODE, STATE);

      expect(mockFacebookAccounts.connectPage).toHaveBeenCalledWith(WORKSPACE_ID, {
        pageId: 'page-1',
        pageName: 'My Page',
        accessToken: 'tok',
        tokenExpiresAt: null,
      });
    });
  });

  describe('handleCallback', () => {
    it('extracts workspaceId from state and delegates to connectPage', async () => {
      vi.mocked(mockOAuthProvider.extractWorkspaceId).mockReturnValue('ws-001');
      vi.mocked(mockOAuthProvider.verifyState).mockReturnValue(true);
      vi.mocked(mockGraphApi.exchangeCodeForPages).mockResolvedValue([
        { id: 'page-1', name: 'My Page', accessToken: 'tok', expiresAt: null },
      ]);
      vi.mocked(mockFacebookAccounts.connectPage).mockResolvedValue({
        id: 'acc-1',
        pageId: 'page-1',
        pageName: 'My Page',
        connectedAt: new Date(),
      } as unknown as import('./entities/facebook-account.entity').FacebookAccount);

      const result = await service.handleCallback('auth-code', 'valid.state');

      expect(result.isOk()).toBe(true);
      expect(mockOAuthProvider.extractWorkspaceId).toHaveBeenCalledWith('valid.state');
    });

    it('returns err(CROSS_WORKSPACE) when state is structurally invalid', async () => {
      vi.mocked(mockOAuthProvider.extractWorkspaceId).mockReturnValue(null);

      const result = await service.handleCallback('auth-code', 'malformed');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CROSS_WORKSPACE');
      expect(mockGraphApi.exchangeCodeForPages).not.toHaveBeenCalled();
    });
  });
});
