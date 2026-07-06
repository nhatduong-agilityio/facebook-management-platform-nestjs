import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IFacebookGraphApiProvider,
  type FacebookPageData,
  type PublishedPostResult,
  type RefreshedToken,
} from '../ports/facebook-graph-api.provider.port';

/** Facebook Graph API version used for all token and data calls. */
const GRAPH_VERSION = 'v25.0';

/** Base URL for Facebook Graph API calls. */
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Shape of the Facebook short-lived-token response
 * (`POST /oauth/access_token`).
 */
interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Shape of the long-lived token response
 * (`GET /oauth/access_token?grant_type=fb_exchange_token`).
 */
interface LongLivedTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Shape of a single page entry from `GET /me/accounts`.
 */
interface GraphPageEntry {
  id: string;
  name: string;
  access_token: string;
  /** Seconds from now until the token expires. Present on page tokens. */
  expires_in?: number;
}

/**
 * Concrete Facebook Graph API adapter.
 *
 * Reads `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_REDIRECT_URI`
 * from `ConfigService`. Uses the Node.js built-in `fetch` (available since Node 18).
 *
 * All three Graph API calls (code exchange, long-lived token, page list) are
 * performed synchronously in `exchangeCodeForPages` to keep the port surface small.
 * T2.3 will add a separate refresh method.
 */
@Injectable()
export class FacebookGraphApiAdapter extends IFacebookGraphApiProvider {
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
  async refreshPageToken(pageAccessToken: string): Promise<RefreshedToken> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: pageAccessToken,
    });

    const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Facebook token refresh failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as LongLivedTokenResponse;
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    };
  }

  /** @inheritdoc */
  async exchangeCodeForPages(code: string): Promise<FacebookPageData[]> {
    const shortToken = await this.exchangeCodeForShortLivedToken(code);
    const longToken = await this.getLongLivedToken(shortToken);
    return this.listPages(longToken);
  }

  /**
   * Exchanges the OAuth authorization code for a short-lived user access token.
   *
   * @param code - OAuth authorization code from the Facebook redirect.
   * @returns Plaintext short-lived access token string.
   * @throws If the Graph API returns a non-2xx response or malformed body.
   */
  private async exchangeCodeForShortLivedToken(code: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });

    const res = await fetch(`${GRAPH_BASE}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Facebook token exchange failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as TokenResponse;
    return data.access_token;
  }

  /**
   * Exchanges a short-lived user token for a long-lived user token (60-day TTL).
   *
   * @param shortLivedToken - Short-lived user access token.
   * @returns Plaintext long-lived access token string.
   * @throws If the Graph API returns a non-2xx response or malformed body.
   */
  private async getLongLivedToken(shortLivedToken: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Facebook long-lived token exchange failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as LongLivedTokenResponse;
    return data.access_token;
  }

  /** @inheritdoc */
  async publishPost(
    pageId: string,
    pageAccessToken: string,
    content: string,
    mediaUrl?: string,
  ): Promise<PublishedPostResult> {
    const body: Record<string, string> = {
      message: content,
      access_token: pageAccessToken,
    };
    if (mediaUrl) body['link'] = mediaUrl;

    const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Facebook Graph API POST /${pageId}/feed failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return { postId: data.id };
  }

  /** @inheritdoc */
  async checkPostLive(facebookGraphPostId: string, pageAccessToken: string): Promise<boolean> {
    const params = new URLSearchParams({
      fields: 'id',
      access_token: pageAccessToken,
    });

    const res = await fetch(`${GRAPH_BASE}/${facebookGraphPostId}?${params.toString()}`);

    if (!res.ok) {
      // 4xx means the post is gone / token invalid — treat as not live (not a network error)
      return false;
    }

    const data = (await res.json()) as { id?: string };
    return typeof data.id === 'string' && data.id.length > 0;
  }

  /**
   * Lists the Facebook Pages the user administers, with their page access tokens.
   *
   * @param userAccessToken - Long-lived user access token.
   * @returns Array of `FacebookPageData`; empty if the user manages no pages.
   * @throws If the Graph API returns a non-2xx response or malformed body.
   */
  private async listPages(userAccessToken: string): Promise<FacebookPageData[]> {
    const params = new URLSearchParams({
      access_token: userAccessToken,
      fields: 'id,name,access_token,expires_in',
    });

    const res = await fetch(`${GRAPH_BASE}/me/accounts?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Facebook page list failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { data: GraphPageEntry[] };
    return (data.data ?? []).map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
      expiresAt: page.expires_in
        ? new Date(Date.now() + page.expires_in * 1000)
        : null,
    }));
  }
}
