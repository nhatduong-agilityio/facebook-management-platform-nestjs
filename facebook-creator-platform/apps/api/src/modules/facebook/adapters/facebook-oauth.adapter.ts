import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { IFacebookOAuthProvider, type ConnectUrl } from '../ports/facebook-oauth.provider.port';

/** Facebook Graph API version used for all OAuth and API calls. */
const GRAPH_VERSION = 'v25.0';

/**
 * OAuth scopes requested when connecting a Facebook Page.
 *
 * - `pages_manage_posts`    — create / edit / delete posts on behalf of a page.
 * - `pages_read_engagement` — read likes, comments, and reach metrics.
 * - `pages_show_list`       — list pages the user administers.
 */
const OAUTH_SCOPES = ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'].join(',');

/**
 * Concrete Facebook OAuth adapter.
 *
 * Reads `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_REDIRECT_URI`
 * from `ConfigService`. The CSRF `state` is a `base64url(payload).<hmac>` token
 * signed with `FACEBOOK_APP_SECRET`; the callback (T2.2) must re-verify it.
 */
@Injectable()
export class FacebookOAuthAdapter extends IFacebookOAuthProvider {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly webhookVerifyToken: string;

  constructor(config: ConfigService) {
    super();
    this.appId = config.getOrThrow<string>('FACEBOOK_APP_ID');
    this.appSecret = config.getOrThrow<string>('FACEBOOK_APP_SECRET');
    this.redirectUri = config.getOrThrow<string>('FACEBOOK_REDIRECT_URI');
    this.webhookVerifyToken = config.getOrThrow<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
  }

  /** @inheritdoc */
  buildConnectUrl(workspaceId: string): ConnectUrl {
    const state = this.buildState(workspaceId);

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: OAUTH_SCOPES,
      state,
      response_type: 'code',
    });

    const url = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
    return { url, state };
  }

  /** @inheritdoc */
  verifyState(state: string, workspaceId: string): boolean {
    const dotIndex = state.lastIndexOf('.');
    if (dotIndex === -1) return false;

    const payload = state.slice(0, dotIndex);
    const sig = state.slice(dotIndex + 1);

    if (!payload || !sig) return false;

    const expectedSig = createHmac('sha256', this.appSecret).update(payload).digest('hex');

    // Compare as UTF-8 buffers (both are hex strings of equal length) to avoid
    // buffer length mismatch if sig is malformed.
    if (sig.length !== expectedSig.length) return false;

    try {
      const sigValid = timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
      if (!sigValid) return false;
    } catch {
      return false;
    }

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        workspaceId?: string;
      };
      return decoded.workspaceId === workspaceId;
    } catch {
      return false;
    }
  }

  /** @inheritdoc */
  verifyWebhookToken(token: string): boolean {
    if (token.length !== this.webhookVerifyToken.length) return false;
    try {
      return timingSafeEqual(Buffer.from(token), Buffer.from(this.webhookVerifyToken));
    } catch {
      return false;
    }
  }

  /** @inheritdoc */
  verifyWebhookSignature(rawBody: Buffer, sigHeader: string): boolean {
    const prefix = 'sha256=';
    if (!sigHeader.startsWith(prefix)) return false;
    const receivedHex = sigHeader.slice(prefix.length);
    const expectedHex = createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    if (receivedHex.length !== expectedHex.length) return false;
    try {
      return timingSafeEqual(Buffer.from(receivedHex, 'hex'), Buffer.from(expectedHex, 'hex'));
    } catch {
      return false;
    }
  }

  /** @inheritdoc */
  extractWorkspaceId(state: string): string | null {
    const dotIndex = state.lastIndexOf('.');
    if (dotIndex === -1) return null;
    const payload = state.slice(0, dotIndex);
    if (!payload) return null;
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        workspaceId?: string;
      };
      return typeof decoded.workspaceId === 'string' ? decoded.workspaceId : null;
    } catch {
      return null;
    }
  }

  /**
   * Builds a tamper-proof CSRF state token.
   *
   * Format: `<base64url-payload>.<hex-hmac>`
   *
   * The payload encodes `workspaceId` and a 16-byte random nonce so each
   * authorization attempt produces a unique state. The callback must
   * call `verifyState` before accepting the OAuth code.
   */
  private buildState(workspaceId: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload = Buffer.from(JSON.stringify({ workspaceId, nonce })).toString('base64url');
    const sig = createHmac('sha256', this.appSecret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }
}
