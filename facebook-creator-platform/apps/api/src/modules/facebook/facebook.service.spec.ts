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
  verifyWebhookToken: vi.fn(),
} as unknown as IFacebookOAuthProvider;

const mockGraphApi = {
  exchangeCodeForPages: vi.fn(),
  refreshPageToken: vi.fn(),
} as unknown as IFacebookGraphApiProvider;

const mockFacebookAccounts = {
  findByPageId: vi.fn(),
  findByIdAndWorkspace: vi.fn(),
  save: vi.fn(),
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

  describe('refreshAccountToken', () => {
    const WORKSPACE_ID = 'ws-001';
    const ACCOUNT_ID = 'acc-uuid-1';

    const fakeAccount = {
      id: ACCOUNT_ID,
      pageId: 'page-1',
      pageName: 'My Page',
      accessToken: 'decrypted-current-token',
      connectedAt: new Date(),
      updateToken: vi.fn(),
    } as unknown as import('./entities/facebook-account.entity').FacebookAccount;

    it('refreshes and saves the token on the happy path', async () => {
      vi.mocked(mockFacebookAccounts.findByIdAndWorkspace).mockResolvedValue(fakeAccount);
      vi.mocked(mockGraphApi.refreshPageToken).mockResolvedValue({
        accessToken: 'new-token',
        expiresAt: new Date('2027-01-01'),
      });
      vi.mocked(mockFacebookAccounts.save).mockResolvedValue(undefined);

      const result = await service.refreshAccountToken(WORKSPACE_ID, ACCOUNT_ID);

      expect(result.isOk()).toBe(true);
      expect(mockGraphApi.refreshPageToken).toHaveBeenCalledWith('decrypted-current-token');
      expect(fakeAccount.updateToken).toHaveBeenCalledWith('new-token', expect.any(Date));
      expect(mockFacebookAccounts.save).toHaveBeenCalledWith(fakeAccount);
    });

    it('returns err(NOT_FOUND) when the account does not exist in the workspace', async () => {
      vi.mocked(mockFacebookAccounts.findByIdAndWorkspace).mockResolvedValue(null);

      const result = await service.refreshAccountToken(WORKSPACE_ID, 'missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
      expect(mockGraphApi.refreshPageToken).not.toHaveBeenCalled();
    });

    it('returns ok(undefined) — never exposes the token in the result (BR-F11)', async () => {
      vi.mocked(mockFacebookAccounts.findByIdAndWorkspace).mockResolvedValue(fakeAccount);
      vi.mocked(mockGraphApi.refreshPageToken).mockResolvedValue({
        accessToken: 'new-secret-token',
        expiresAt: null,
      });
      vi.mocked(mockFacebookAccounts.save).mockResolvedValue(undefined);

      const result = await service.refreshAccountToken(WORKSPACE_ID, ACCOUNT_ID);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeUndefined();
    });
  });

  describe('verifyWebhookChallenge', () => {
    it('returns ok(challenge) when mode is "subscribe" and token is valid', () => {
      vi.mocked(mockOAuthProvider.verifyWebhookToken).mockReturnValue(true);

      const result = service.verifyWebhookChallenge('subscribe', 'secret', 'challenge-nonce');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('challenge-nonce');
    });

    it('returns err(FORBIDDEN) when hub.mode is not "subscribe"', () => {
      const result = service.verifyWebhookChallenge('unsubscribe', 'secret', 'challenge-nonce');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
      expect(mockOAuthProvider.verifyWebhookToken).not.toHaveBeenCalled();
    });

    it('returns err(FORBIDDEN) when the verify_token does not match', () => {
      vi.mocked(mockOAuthProvider.verifyWebhookToken).mockReturnValue(false);

      const result = service.verifyWebhookChallenge('subscribe', 'wrong-token', 'challenge-nonce');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('FORBIDDEN');
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
