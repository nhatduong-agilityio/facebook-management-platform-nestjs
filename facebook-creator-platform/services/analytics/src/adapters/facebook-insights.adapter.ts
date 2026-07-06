import { Injectable } from '@nestjs/common';
import {
  IFacebookInsightsProvider,
  type PostInsightsResult,
} from '../ports/facebook-insights.provider.port';

/** Facebook Graph API version used for all insights calls. */
const GRAPH_VERSION = 'v25.0';

/** Base URL for Facebook Graph API calls. */
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Metric names requested from the Graph API insights endpoint. */
const METRICS = [
  'post_impressions',
  'post_impressions_unique',
  'post_reactions_like_total',
  'post_comments',
  'post_shares',
].join(',');

/** Shape of a single metric value in the Graph API insights response. */
interface InsightItem {
  name: string;
  values?: Array<{ value: number | Record<string, number> }>;
}

/** Shape of the Graph API `/{postId}/insights` response. */
interface InsightsResponse {
  data?: InsightItem[];
}

/**
 * Fetches post engagement metrics from the Facebook Graph API.
 *
 * Calls `GET /{graphPostId}/insights?metric=...&access_token=...`.
 * Returns zeros for any metric that the Graph API omits or returns as an object
 * (some metrics return `{ action_type: count }` rather than a scalar).
 */
@Injectable()
export class FacebookInsightsAdapter extends IFacebookInsightsProvider {
  /** @inheritdoc */
  async getPostInsights(graphPostId: string, pageToken: string): Promise<PostInsightsResult> {
    const params = new URLSearchParams({
      metric: METRICS,
      period: 'lifetime',
      access_token: pageToken,
    });

    const res = await fetch(`${GRAPH_BASE}/${graphPostId}/insights?${params.toString()}`);

    if (!res.ok) {
      // Graph API errors (token invalid, post deleted) → return zeros so the
      // consumer can still upsert and mark the event as processed.
      return { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0 };
    }

    const body = (await res.json()) as InsightsResponse;
    const byName = new Map<string, number>();

    for (const item of body.data ?? []) {
      const raw = item.values?.[0]?.value;
      byName.set(item.name, typeof raw === 'number' ? raw : 0);
    }

    return {
      reach: byName.get('post_impressions_unique') ?? 0,
      impressions: byName.get('post_impressions') ?? 0,
      likes: byName.get('post_reactions_like_total') ?? 0,
      comments: byName.get('post_comments') ?? 0,
      shares: byName.get('post_shares') ?? 0,
    };
  }
}
