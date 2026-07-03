import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted when a Facebook Page removes our app (deauthorize webhook).
 *
 * Published to `fcp.events` exchange by `FacebookService.processWebhookPayload`.
 * The `FacebookPageDeauthorizedConsumer` soft-deletes the `FacebookAccount` and
 * transitions all `scheduled`/`publishing` posts for that page to `failed`.
 *
 * No PII: `pageId` is the Facebook Page id, not a user identifier.
 */
export class FacebookPageDeauthorizedEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for `fcp.events` topic exchange. */
  readonly routingKey = 'facebook.page.deauthorized' as const;

  /**
   * @param pageId - Facebook Page id that deauthorized the app.
   */
  constructor(readonly pageId: string) {
    super();
  }
}
