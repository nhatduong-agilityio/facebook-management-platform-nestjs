import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { IFacebookOAuthProvider, type ConnectUrl } from '../ports/facebook-oauth.provider.port';

/** Facebook Graph API version used for all OAuth and API calls. */
const GRAPH_VERSION = 'v21.0';

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

  constructor(config: ConfigService) {
    super();
    this.appId = config.getOrThrow<string>('FACEBOOK_APP_ID');
    this.appSecret = config.getOrThrow<string>('FACEBOOK_APP_SECRET');
    this.redirectUri = config.getOrThrow<string>('FACEBOOK_REDIRECT_URI');
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

  /**
   * Builds a tamper-proof CSRF state token.
   *
   * Format: `<base64url-payload>.<hex-hmac-prefix>`
   *
   * The payload encodes `workspaceId` and a 16-byte random nonce so each
   * authorization attempt produces a unique state. The HMAC prefix (first 32
   * hex chars = 128 bits) is enough for CSRF protection without bloating the
   * token; the full digest is used for comparison on the callback side.
   */
  private buildState(workspaceId: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload = Buffer.from(JSON.stringify({ workspaceId, nonce })).toString('base64url');
    const sig = createHmac('sha256', this.appSecret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }
}
