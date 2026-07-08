import { Migration } from '@mikro-orm/migrations';

/**
 * Creates the `email` schema and `email_delivery_logs` table.
 *
 * Key divergence from `fcp-ddl.sql`: the PK uses no `DEFAULT gen_random_uuid()`
 * because the entity assigns a UUID v7 before `em.flush()` (ADR-013).
 *
 * Indexes mirror the DDL: `workspace_id`, `user_id`, `status`.
 * `dedupe_key` is UNIQUE (BR-R08) to prevent double-send on event replay.
 */
export class Migration20260708000001_EmailSchema extends Migration {
  async up(): Promise<void> {
    this.addSql(`CREATE SCHEMA IF NOT EXISTS email`);

    this.addSql(`
      CREATE TABLE email.email_delivery_logs (
        id                  UUID PRIMARY KEY,
        workspace_id        UUID,
        user_id             UUID,
        email_type          VARCHAR(50)  NOT NULL,
        recipient_email     VARCHAR(255) NOT NULL,
        template_name       VARCHAR(100) NOT NULL,
        provider            VARCHAR(30)  NOT NULL,
        status              VARCHAR(15)  NOT NULL DEFAULT 'pending',
        dedupe_key          VARCHAR(255) NOT NULL,
        retry_count         INTEGER      NOT NULL DEFAULT 0,
        related_entity_type VARCHAR(100),
        related_entity_id   UUID,
        sent_at             TIMESTAMPTZ,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT uq_email_delivery_logs_dedupe_key    UNIQUE (dedupe_key),
        CONSTRAINT chk_email_delivery_logs_type   CHECK (email_type IN ('invitation','publish_success','publish_failed','token_expiring','payment_failed')),
        CONSTRAINT chk_email_delivery_logs_status CHECK (status     IN ('pending','sent','failed')),
        CONSTRAINT chk_email_delivery_logs_provider CHECK (provider IN ('Resend','SES','SendGrid'))
      )
    `);

    this.addSql(`CREATE INDEX idx_email_delivery_logs_workspace_id ON email.email_delivery_logs (workspace_id)`);
    this.addSql(`CREATE INDEX idx_email_delivery_logs_user_id      ON email.email_delivery_logs (user_id)`);
    this.addSql(`CREATE INDEX idx_email_delivery_logs_status       ON email.email_delivery_logs (status)`);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS email.email_delivery_logs`);
    this.addSql(`DROP SCHEMA IF EXISTS email`);
  }
}
