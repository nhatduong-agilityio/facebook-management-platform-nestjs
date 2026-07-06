import { uuidv7 } from 'uuidv7';
import { DomainEvent } from '../../../common/events/event-bus.port';

/**
 * Emitted once per near-expiry `FacebookAccount` by the daily token-expiry scheduler.
 *
 * Published to the `fcp.events` topic exchange **after** each account is identified
 * (§6, ADR-053). Consumed by the Email Service (T4.3) to send a renewal reminder.
 *
 * No PII in payload — the actual access token is never included (BR-F11).
 * Token value stays encrypted at rest; the Email Service resolves the recipient
 * email via `GET /internal/users/:id` (ADR-050).
 */
export class FacebookTokenExpiringEvent extends DomainEvent {
  /** UUID v7 dedup key; consumers use `dedup:<eventId>` in Redis (§11). */
  readonly eventId: string = uuidv7();
  /** AMQP routing key for the `fcp.events` topic exchange. */
  readonly routingKey = 'facebook.token_expiring' as const;

  /**
   * @param accountId       - UUID v7 of the `FacebookAccount` record.
   * @param workspaceId     - UUID of the owning workspace.
   * @param pageId          - Facebook Page ID (external — not a user identifier).
   * @param tokenExpiresAt  - When the token expires; used by Email Service for the reminder body.
   */
  constructor(
    readonly accountId: string,
    readonly workspaceId: string,
    readonly pageId: string,
    readonly tokenExpiresAt: Date,
  ) {
    super();
  }
}
