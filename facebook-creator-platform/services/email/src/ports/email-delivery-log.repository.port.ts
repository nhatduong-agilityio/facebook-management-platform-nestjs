import type { EmailDeliveryLog } from '../entities/email-delivery-log.entity';
import type { EmailType, EmailProvider } from '../entities/email-delivery-log.entity';

/**
 * Input for creating a new `EmailDeliveryLog` row.
 */
export interface CreateEmailLogInput {
  workspaceId?: string;
  userId?: string;
  emailType: EmailType;
  recipientEmail: string;
  templateName: string;
  provider: EmailProvider;
  dedupeKey: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Port: persistence contract for `EmailDeliveryLog`.
 *
 * All methods flush within the operation (log records are append-only
 * and not part of a larger multi-aggregate transaction).
 */
export abstract class IEmailDeliveryLogRepository {
  /**
   * Inserts a new log row with `status='pending'`.
   *
   * Silently no-ops if a row with the same `dedupeKey` already exists
   * (unique-constraint violation is swallowed) — prevents duplicate rows
   * on event replay after Redis TTL expiry.
   *
   * @param input - Log creation fields.
   * @returns The persisted entity (or the existing one on duplicate).
   */
  abstract create(input: CreateEmailLogInput): Promise<EmailDeliveryLog>;

  /**
   * Marks the log as successfully sent.
   *
   * @param id    - UUID of the `EmailDeliveryLog` row.
   * @param sentAt - Timestamp of the successful delivery.
   */
  abstract updateSent(id: string, sentAt: Date): Promise<void>;

  /**
   * Marks the log as permanently failed and records the total delivery attempt count.
   *
   * Called when a `PermanentEmailError` is thrown by the provider, or when
   * the message has exhausted `MAX_EMAIL_RETRIES` redeliveries.
   *
   * @param id       - UUID of the `EmailDeliveryLog` row.
   * @param attempts - Total delivery attempts consumed (1 = immediate failure, 4 = 3 retries exhausted).
   */
  abstract updateFailed(id: string, attempts: number): Promise<void>;
}
