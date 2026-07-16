import { Migration } from '@mikro-orm/migrations';

/**
 * Adds `last_retry_at` to `messaging.event_message_logs`.
 *
 * `retry_count` already exists from `Migration20260703000001_MessagingSchema`.
 * `last_retry_at` is set by the outbox relay job each time it increments `retry_count`
 * so operators can see when the last relay attempt occurred.
 */
export class Migration20260716000001_OutboxRetryColumns extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE messaging.event_message_logs
        ADD COLUMN last_retry_at timestamptz;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE messaging.event_message_logs
        DROP COLUMN IF EXISTS last_retry_at;
    `);
  }
}
