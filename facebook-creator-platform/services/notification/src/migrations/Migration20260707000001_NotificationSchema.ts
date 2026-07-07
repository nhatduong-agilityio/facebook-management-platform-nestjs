import { Migration } from '@mikro-orm/migrations';

/**
 * Initial migration for the `notification` schema.
 *
 * Creates:
 * - `notification.notifications`           — one row per notification event
 * - `notification.notification_recipients` — per-user delivery record with one-way read flag (BR-F08)
 * - `notification.workspace_members_projection` — CQRS projection for workspace membership (ADR-052)
 * - DB trigger on `notification_recipients` to enforce BR-F08 (`read_status` one-way)
 *
 * PKs are UUID columns without `DEFAULT gen_random_uuid()` — app-generated UUID v7 (ADR-013).
 * Cross-schema references are plain `uuid` columns with NO FK constraints (BR-R06).
 * Every logical FK has a btree index (BR-R08).
 */
export class Migration20260707000001_NotificationSchema extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE SCHEMA IF NOT EXISTS notification;`);

    this.addSql(`
      CREATE TABLE notification.notifications (
        id            UUID PRIMARY KEY,
        workspace_id  UUID         NOT NULL,
        type          VARCHAR(50)  NOT NULL,
        title         VARCHAR(150) NOT NULL,
        message       TEXT         NOT NULL,
        payload       JSONB,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
      );
    `);

    this.addSql(
      `CREATE INDEX idx_notifications_workspace_id ON notification.notifications (workspace_id);`,
    );

    this.addSql(`
      CREATE TABLE notification.notification_recipients (
        id               UUID PRIMARY KEY,
        notification_id  UUID        NOT NULL
          REFERENCES notification.notifications(id) ON DELETE CASCADE,
        user_id          UUID        NOT NULL,
        read_status      BOOLEAN     NOT NULL DEFAULT false,
        read_at          TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_notification_recipient UNIQUE (notification_id, user_id)
      );
    `);

    this.addSql(
      `CREATE INDEX idx_notification_recipients_user_id ON notification.notification_recipients (user_id);`,
    );

    /* Partial index for fast unread lookups. */
    this.addSql(`
      CREATE INDEX idx_notification_recipients_unread
        ON notification.notification_recipients (user_id, notification_id)
        WHERE read_status = false;
    `);

    /* BR-F08: enforce one-way read_status (false → true only). */
    this.addSql(`
      CREATE OR REPLACE FUNCTION notification.prevent_read_status_reversal()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.read_status = true AND NEW.read_status = false THEN
          RAISE EXCEPTION 'read_status cannot be reversed (BR-F08)';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_notification_recipients_read_status
        BEFORE UPDATE ON notification.notification_recipients
        FOR EACH ROW EXECUTE FUNCTION notification.prevent_read_status_reversal();
    `);

    this.addSql(`
      CREATE TABLE notification.workspace_members_projection (
        workspace_id  UUID        NOT NULL,
        user_id       UUID        NOT NULL,
        role          VARCHAR(20) NOT NULL,
        synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id)
      );
    `);

    this.addSql(
      `CREATE INDEX idx_wmp_workspace_id ON notification.workspace_members_projection (workspace_id);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `DROP TRIGGER IF EXISTS trg_notification_recipients_read_status ON notification.notification_recipients;`,
    );
    this.addSql(
      `DROP FUNCTION IF EXISTS notification.prevent_read_status_reversal();`,
    );
    this.addSql(`DROP TABLE IF EXISTS notification.notification_recipients;`);
    this.addSql(`DROP TABLE IF EXISTS notification.notifications;`);
    this.addSql(`DROP TABLE IF EXISTS notification.workspace_members_projection;`);
    this.addSql(`DROP SCHEMA IF EXISTS notification;`);
  }
}
