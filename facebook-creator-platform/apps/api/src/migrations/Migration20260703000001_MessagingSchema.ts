import { Migration } from '@mikro-orm/migrations';

/**
 * Creates the `messaging` schema with `event_message_logs` and `dead_letter_messages`.
 *
 * These tables are infrastructure observability logs — written by the event bus publisher
 * (pending → processed/failed) and by the DLQ consumer (dlq status + dead_letter_messages row).
 *
 * Intentional DDL deviations from service-owned entity conventions (documented here per T5.2):
 * - `event_id` PK is app-assigned (no DB DEFAULT) — consistent with ADR-013.
 * - `dead_letter_messages.id` uses `DEFAULT gen_random_uuid()` — per the reference DDL;
 *   this is an infra-only append table, not a domain entity.
 * - No `deleted_at` / soft-delete — both tables are append-only infra logs (retention via
 *   periodic purge job, not soft delete).
 */
export class Migration20260703000001_MessagingSchema extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE SCHEMA IF NOT EXISTS messaging;`);

    this.addSql(`
      CREATE TABLE messaging.event_message_logs (
        event_id          uuid        PRIMARY KEY,
        event_type        varchar(100) NOT NULL,
        exchange_name     varchar(100) NOT NULL,
        routing_key       varchar(150) NOT NULL,
        processing_status varchar(15)  NOT NULL DEFAULT 'pending',
        retry_count       integer      NOT NULL DEFAULT 0,
        payload           jsonb        NOT NULL,
        result            jsonb,
        processed_at      timestamptz,
        created_at        timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT chk_event_message_logs_status
          CHECK (processing_status IN ('pending', 'processed', 'failed', 'dlq'))
      );
    `);

    this.addSql(`
      CREATE INDEX idx_event_message_logs_status
        ON messaging.event_message_logs (processing_status);
    `);

    this.addSql(`
      CREATE INDEX idx_event_message_logs_event_type
        ON messaging.event_message_logs (event_type);
    `);

    this.addSql(`
      CREATE TABLE messaging.dead_letter_messages (
        id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id        uuid        NOT NULL
          REFERENCES messaging.event_message_logs (event_id) ON DELETE RESTRICT,
        error_message   text        NOT NULL,
        retry_count     integer     NOT NULL,
        failed_at       timestamptz NOT NULL DEFAULT now(),
        reprocessed_at  timestamptz,
        CONSTRAINT uq_dead_letter_messages_event_id UNIQUE (event_id)
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS messaging.dead_letter_messages;`);
    this.addSql(`DROP TABLE IF EXISTS messaging.event_message_logs;`);
    this.addSql(`DROP SCHEMA IF EXISTS messaging;`);
  }
}
