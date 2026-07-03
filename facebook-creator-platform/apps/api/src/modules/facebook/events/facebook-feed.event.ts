import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted when Facebook notifies us that a post was published on a Page (feed/add event).
 *
 * Published to `fcp.events` exchange by `FacebookService.processWebhookPayload` after
 * HMAC verification — before any DB writes. The `FacebookFeedConsumer` drives the
 * `publishing → published` status transition on the matching `Post`.
 *
 * No PII: `facebookPostId` is the Graph API post id (not a user identifier);
 * `pageId` is the Facebook Page id.
 */
export class FacebookFeedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'facebook.feed' as const;

  /**
   * @param facebookPostId - Graph API post id (the `post_id` field in the feed webhook value).
   *                         Matches `Post.facebookGraphPostId` stored during the `publishing` transition.
   * @param pageId         - Facebook Page id that published the post.
   */
  constructor(
    readonly facebookPostId: string,
    readonly pageId: string,
  ) {
    super();
  }
}
