-- =============================================================================
-- Facebook Creator Platform — NestJS Practice
-- fcp-ddl-CR01.sql — DELTA over fcp-ddl.sql, implementing Change Request CR-01.
--
-- Apply AFTER the base fcp-ddl.sql, or fold these changes into it.
-- Covers: R2 (PII), R3 (app-generated keys), R4 (soft delete + timestamps),
--         R6 (audit moves to MongoDB), R8 (index every FK).
-- R1 (MikroORM), R5 (Result pattern), R7 (state machine), R9 (Artillery) are
-- application/diagram concerns and do not change the SQL except where noted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- R6 — Remove audit_logs from PostgreSQL (now owned by the Audit Service / MongoDB)
-- -----------------------------------------------------------------------------
-- audit_logs and its indexes are dropped entirely. The audit trail is rebuilt
-- in MongoDB (collection audit.events), populated by the Audit Service from
-- domain events. actor_user_id / workspace_id become logical references inside
-- the Mongo document (BR-R06 extended), reconciled via the originating event.
DROP TABLE IF EXISTS core.audit_logs CASCADE;
-- PostgreSQL table count: 16 -> 15.

-- -----------------------------------------------------------------------------
-- R3 — Application-generated UUID v7 keys for the separate services.
-- Drop the DB-side DEFAULT so the id MUST be supplied by the application
-- (MikroORM creates the entity in memory first; the id is available before flush).
-- core.* (apps/api) may keep its DEFAULT, but is shown here for full consistency.
-- messaging.event_message_logs.event_id is already publisher-assigned (unchanged).
-- -----------------------------------------------------------------------------
ALTER TABLE billing.plans                       ALTER COLUMN id DROP DEFAULT;
ALTER TABLE billing.subscriptions               ALTER COLUMN id DROP DEFAULT;
ALTER TABLE billing.billing_events              ALTER COLUMN id DROP DEFAULT;
ALTER TABLE analytics.post_metrics              ALTER COLUMN id DROP DEFAULT;
ALTER TABLE notification.notifications          ALTER COLUMN id DROP DEFAULT;
ALTER TABLE notification.notification_recipients ALTER COLUMN id DROP DEFAULT;
ALTER TABLE email.email_delivery_logs           ALTER COLUMN id DROP DEFAULT;
ALTER TABLE messaging.dead_letter_messages      ALTER COLUMN id DROP DEFAULT;
-- Optional (recommended) — also drop on core.* for one uniform convention:
-- ALTER TABLE core.users              ALTER COLUMN id DROP DEFAULT;
-- ALTER TABLE core.workspaces         ALTER COLUMN id DROP DEFAULT;
-- ALTER TABLE core.workspace_members  ALTER COLUMN id DROP DEFAULT;
-- ALTER TABLE core.invitations        ALTER COLUMN id DROP DEFAULT;
-- ALTER TABLE core.facebook_accounts  ALTER COLUMN id DROP DEFAULT;
-- ALTER TABLE core.posts              ALTER COLUMN id DROP DEFAULT;

-- -----------------------------------------------------------------------------
-- R4 — Full timestamp triplet (created_at / updated_at / deleted_at) + soft delete.
-- Add the columns wherever missing, attach the updated_at trigger to every table,
-- and add a "live rows" partial index. deleted_at NOT NULL => soft-deleted.
-- -----------------------------------------------------------------------------

-- core.workspace_members (had only joined_at-style timestamps)
ALTER TABLE core.workspace_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TRIGGER trg_workspace_members_updated_at BEFORE UPDATE ON core.workspace_members
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_workspace_members_live ON core.workspace_members (id) WHERE deleted_at IS NULL;

-- core.invitations
ALTER TABLE core.invitations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TRIGGER trg_invitations_updated_at BEFORE UPDATE ON core.invitations
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_invitations_live ON core.invitations (id) WHERE deleted_at IS NULL;

-- core.users / workspaces / facebook_accounts / posts already have created+updated;
-- just add deleted_at + a live-rows index.
ALTER TABLE core.users             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE core.workspaces        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE core.facebook_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE core.posts             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX idx_users_live             ON core.users (id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_live        ON core.workspaces (id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_facebook_accounts_live ON core.facebook_accounts (id) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_live             ON core.posts (id)             WHERE deleted_at IS NULL;

-- billing.plans / subscriptions already have updated_at; add deleted_at.
ALTER TABLE billing.plans         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE billing.subscriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX idx_plans_live         ON billing.plans (id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_subscriptions_live ON billing.subscriptions (id) WHERE deleted_at IS NULL;

-- billing.billing_events (append-only: add updated_at+deleted_at for uniformity)
ALTER TABLE billing.billing_events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TRIGGER trg_billing_events_updated_at BEFORE UPDATE ON billing.billing_events
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- analytics.post_metrics
ALTER TABLE analytics.post_metrics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TRIGGER trg_post_metrics_updated_at BEFORE UPDATE ON analytics.post_metrics
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_post_metrics_live ON analytics.post_metrics (id) WHERE deleted_at IS NULL;

-- notification.notifications / notification_recipients
ALTER TABLE notification.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE notification.notification_recipients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notification.notifications
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_notification_recipients_updated_at BEFORE UPDATE ON notification.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_notifications_live           ON notification.notifications (id)           WHERE deleted_at IS NULL;
CREATE INDEX idx_notification_recipients_live ON notification.notification_recipients (id) WHERE deleted_at IS NULL;

-- email.email_delivery_logs
ALTER TABLE email.email_delivery_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TRIGGER trg_email_delivery_logs_updated_at BEFORE UPDATE ON email.email_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_email_delivery_logs_live ON email.email_delivery_logs (id) WHERE deleted_at IS NULL;

-- messaging.* are infra append-only logs: NOT soft-deleted. They are hard-purged
-- by the retention job (see base DDL note). No deleted_at added intentionally.

-- -----------------------------------------------------------------------------
-- R8 — Index every foreign key. Audit showed only one real gap:
-- -----------------------------------------------------------------------------
CREATE INDEX idx_notification_recipients_notification_id
  ON notification.notification_recipients (notification_id);
-- All other FK columns are already indexed, or covered by a UNIQUE constraint:
--   billing.subscriptions.workspace_id          -> UNIQUE (BR-R03)
--   messaging.dead_letter_messages.event_id     -> UNIQUE (BR-R09)
-- (core.audit_logs FK indexes are gone with the table, per R6.)

-- -----------------------------------------------------------------------------
-- R2 — PII encryption at rest is application-layer (AES-256-GCM via MikroORM
-- custom type). SQL type is unchanged; the comment documents the intent.
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN core.facebook_accounts.access_token IS
  'BR-F01/BR-F11: AES-256-GCM ciphertext (IV+auth-tag prefixed), app-encrypted; never SELECTed by the API layer';

-- =============================================================================
-- Done — CR-01 delta.
-- =============================================================================
