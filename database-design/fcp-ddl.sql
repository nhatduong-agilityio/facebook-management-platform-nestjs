-- =============================================================================
-- Facebook Creator Platform — NestJS Practice
-- DDL Schema — generated from docs/04-Database-Design.docx (Phases 3, 4, 5)
--
-- Run order: this file is self-contained and idempotent-ish (DROP SCHEMA ...
-- CASCADE at the top). Safe to re-run on a throwaway dev database.
--
-- Notes on faithfulness to the design doc:
--   * Every cross-schema column (marked "*" in Phase 3) is a plain UUID with
--     NO REFERENCES clause and NO trigger-enforced FK — see BR-R06. Integrity
--     across schemas is an application/event-driven concern, not a DB one.
--   * Postgres CHECK constraints must be IMMUTABLE. Any business rule that
--     needs now()/CURRENT_DATE or a cross-table lookup (BR-F06, BR-F09/BR-R02,
--     BR-R05) is implemented as a trigger instead of a CHECK — a plain CHECK
--     referencing now() is rejected by Postgres at CREATE TABLE time.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Reset (dev convenience) + extensions
-- -----------------------------------------------------------------------------
DROP SCHEMA IF EXISTS core CASCADE;
DROP SCHEMA IF EXISTS billing CASCADE;
DROP SCHEMA IF EXISTS analytics CASCADE;
DROP SCHEMA IF EXISTS notification CASCADE;
DROP SCHEMA IF EXISTS email CASCADE;
DROP SCHEMA IF EXISTS messaging CASCADE;
DROP SCHEMA IF EXISTS search CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()

CREATE SCHEMA core;
CREATE SCHEMA billing;
CREATE SCHEMA analytics;
CREATE SCHEMA notification;
CREATE SCHEMA email;
CREATE SCHEMA messaging;
CREATE SCHEMA search;          -- reserved, no tables — Algolia is the system of record (ADR-004)

COMMENT ON SCHEMA core IS 'Owned by apps/api';
COMMENT ON SCHEMA billing IS 'Owned by billing-service';
COMMENT ON SCHEMA analytics IS 'Owned by analytics-service';
COMMENT ON SCHEMA notification IS 'Owned by notification-service';
COMMENT ON SCHEMA email IS 'Owned by email-service';
COMMENT ON SCHEMA messaging IS 'Shared infra — written by every service via libs/rabbitmq + libs/database';
COMMENT ON SCHEMA search IS 'Reserved — search-service indexes into Algolia, not Postgres (ADR-004)';

-- -----------------------------------------------------------------------------
-- Shared trigger function: maintain updated_at on any table that has it
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SCHEMA: core  (apps/api)
-- =============================================================================

-- ---- users ------------------------------------------------------------------
CREATE TABLE core.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100),
  avatar_url    VARCHAR(2048),
  status        VARCHAR(15) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_clerk_user_id UNIQUE (clerk_user_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT chk_users_status CHECK (status IN ('active', 'inactive'))
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---- workspaces ---------------------------------------------------------------
CREATE TABLE core.workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(120) NOT NULL,
  description   VARCHAR(500),
  status        VARCHAR(15) NOT NULL DEFAULT 'active',
  owner_user_id UUID NOT NULL REFERENCES core.users (id) ON DELETE RESTRICT,  -- same-schema FK (core->core), see BR-R02/BR-F09
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspaces_slug UNIQUE (slug),
  CONSTRAINT chk_workspaces_status CHECK (status IN ('active', 'suspended')),
  CONSTRAINT chk_workspaces_name_len CHECK (char_length(name) >= 2)
);
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON core.workspaces
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_workspaces_owner_user_id ON core.workspaces (owner_user_id);

-- ---- workspace_members --------------------------------------------------------
CREATE TABLE core.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES core.workspaces (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'viewer',
  invited_at   TIMESTAMPTZ,
  accepted_at  TIMESTAMPTZ,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id),               -- BR-R01
  CONSTRAINT chk_workspace_members_role CHECK (role IN ('owner', 'editor', 'viewer'))  -- BR-F03a
);
CREATE INDEX idx_workspace_members_workspace_id ON core.workspace_members (workspace_id);
CREATE INDEX idx_workspace_members_user_id ON core.workspace_members (user_id);
-- Partial index: fast "does this workspace have an owner" lookups (used by the owner-guard trigger below)
CREATE INDEX idx_workspace_members_owner ON core.workspace_members (workspace_id) WHERE role = 'owner';

-- ---- invitations ----------------------------------------------------------------
CREATE TABLE core.invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES core.workspaces (id) ON DELETE CASCADE,
  email               VARCHAR(255) NOT NULL,
  role                VARCHAR(20) NOT NULL,
  token               VARCHAR(64) NOT NULL,
  status              VARCHAR(15) NOT NULL DEFAULT 'pending',
  invited_by_user_id  UUID NOT NULL REFERENCES core.users (id) ON DELETE RESTRICT,  -- same-schema FK (core->core)
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_invitations_token UNIQUE (token),
  CONSTRAINT chk_invitations_role CHECK (role IN ('editor', 'viewer')),                -- BR-F03b: never 'owner'
  CONSTRAINT chk_invitations_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);
CREATE INDEX idx_invitations_workspace_id ON core.invitations (workspace_id);
CREATE INDEX idx_invitations_invited_by_user_id ON core.invitations (invited_by_user_id);

-- ---- facebook_accounts -----------------------------------------------------------
CREATE TABLE core.facebook_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES core.workspaces (id) ON DELETE RESTRICT,
  page_id           VARCHAR(255) NOT NULL,
  page_name         VARCHAR(255) NOT NULL,
  access_token      TEXT NOT NULL,              -- sensitive — never SELECTed by the API layer (BR-F01)
  token_expires_at  TIMESTAMPTZ,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_facebook_accounts_page_id UNIQUE (page_id)
);
CREATE TRIGGER trg_facebook_accounts_updated_at BEFORE UPDATE ON core.facebook_accounts
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_facebook_accounts_workspace_id ON core.facebook_accounts (workspace_id);

-- ---- posts -------------------------------------------------------------------------
CREATE TABLE core.posts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES core.workspaces (id) ON DELETE RESTRICT,
  facebook_account_id      UUID REFERENCES core.facebook_accounts (id) ON DELETE RESTRICT,
  created_by_user_id       UUID NOT NULL REFERENCES core.users (id) ON DELETE RESTRICT,
  title                    VARCHAR(255),
  content                  TEXT NOT NULL,
  media_url                VARCHAR(2048),
  status                   VARCHAR(15) NOT NULL DEFAULT 'draft',
  facebook_graph_post_id   VARCHAR(255),
  scheduled_at             TIMESTAMPTZ,
  published_at             TIMESTAMPTZ,
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_posts_status CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  CONSTRAINT chk_posts_content_len CHECK (char_length(content) BETWEEN 1 AND 63206)    -- BR-F02
);
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON core.posts
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_posts_workspace_id ON core.posts (workspace_id);
CREATE INDEX idx_posts_facebook_account_id ON core.posts (facebook_account_id);
CREATE INDEX idx_posts_created_by_user_id ON core.posts (created_by_user_id);
CREATE INDEX idx_posts_status ON core.posts (status);
CREATE INDEX idx_posts_scheduled_at ON core.posts (scheduled_at) WHERE status = 'scheduled';

-- BR-F06: scheduled_at must be in the future when status = 'scheduled'.
-- now() is STABLE, not IMMUTABLE, so this cannot be a CHECK constraint — trigger instead.
CREATE OR REPLACE FUNCTION core.posts_validate_scheduled_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'scheduled' AND (NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now()) THEN
    RAISE EXCEPTION 'posts.scheduled_at must be a future datetime when status = ''scheduled'' (BR-F06)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_posts_validate_scheduled_at
  BEFORE INSERT OR UPDATE ON core.posts
  FOR EACH ROW EXECUTE FUNCTION core.posts_validate_scheduled_at();

-- BR-R05: a post's facebook_account_id, if set, must belong to the same workspace.
-- Cross-table lookup -> cannot be a plain CHECK constraint either.
CREATE OR REPLACE FUNCTION core.posts_validate_same_workspace_account()
RETURNS TRIGGER AS $$
DECLARE
  account_workspace_id UUID;
BEGIN
  IF NEW.facebook_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO account_workspace_id
  FROM core.facebook_accounts
  WHERE id = NEW.facebook_account_id;

  IF account_workspace_id IS NULL THEN
    RAISE EXCEPTION 'posts.facebook_account_id % does not exist', NEW.facebook_account_id;
  END IF;

  IF account_workspace_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'posts.facebook_account_id % belongs to a different workspace than the post (BR-R05)', NEW.facebook_account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_posts_validate_same_workspace_account
  BEFORE INSERT OR UPDATE ON core.posts
  FOR EACH ROW EXECUTE FUNCTION core.posts_validate_same_workspace_account();

-- ---- audit_logs ----------------------------------------------------------------------
CREATE TABLE core.audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID REFERENCES core.workspaces (id) ON DELETE RESTRICT,  -- denormalised for cheap per-workspace filtering; NULL for platform-wide actions
  actor_user_id  UUID REFERENCES core.users (id) ON DELETE RESTRICT,       -- same-schema FK; NULL for system actions
  action         VARCHAR(150) NOT NULL,
  entity_type    VARCHAR(150) NOT NULL,
  entity_id      UUID,
  old_values     JSONB,
  new_values     JSONB,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_workspace_id ON core.audit_logs (workspace_id);
CREATE INDEX idx_audit_logs_actor_user_id ON core.audit_logs (actor_user_id);
CREATE INDEX idx_audit_logs_entity ON core.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON core.audit_logs (created_at);

-- BR-F09 / BR-R02: every workspace must always have exactly one 'owner' member.
-- Enforced as a trigger on workspace_members because it is a cross-row, cross-statement
-- invariant — not expressible as a single-row CHECK constraint.
CREATE OR REPLACE FUNCTION core.workspace_members_guard_sole_owner()
RETURNS TRIGGER AS $$
DECLARE
  remaining_owners INTEGER;
  target_workspace_id UUID := COALESCE(OLD.workspace_id, NEW.workspace_id);
BEGIN
  -- Only act when an existing OWNER row is being demoted or removed.
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    SELECT count(*) INTO remaining_owners
    FROM core.workspace_members
    WHERE workspace_id = target_workspace_id AND role = 'owner' AND id <> OLD.id;
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot remove the only owner of workspace % (BR-R02)', target_workspace_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    SELECT count(*) INTO remaining_owners
    FROM core.workspace_members
    WHERE workspace_id = target_workspace_id AND role = 'owner' AND id <> OLD.id;
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot demote the only owner of workspace % (BR-F09)', target_workspace_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
-- NOTE: this BEFORE DELETE guard also fires when a core.users row is deleted and
-- cascades into workspace_members. Effect: deleting a user who is the sole owner of
-- any workspace is blocked with a RAISE EXCEPTION. This is intended (you must transfer
-- ownership first), but it is an emergent side effect of the cascade.
CREATE TRIGGER trg_workspace_members_guard_sole_owner
  BEFORE UPDATE OR DELETE ON core.workspace_members
  FOR EACH ROW EXECUTE FUNCTION core.workspace_members_guard_sole_owner();

-- =============================================================================
-- SCHEMA: billing  (billing-service)
-- =============================================================================

CREATE TABLE billing.plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    VARCHAR(20) NOT NULL,
  name                    VARCHAR(50) NOT NULL,
  stripe_price_id         VARCHAR(255),
  monthly_price           DECIMAL(10, 2) NOT NULL DEFAULT 0,
  yearly_price            DECIMAL(10, 2) NOT NULL DEFAULT 0,
  post_limit              INTEGER NOT NULL DEFAULT 10,
  scheduled_post_limit    INTEGER NOT NULL DEFAULT 3,
  analytics_retention_days INTEGER NOT NULL DEFAULT 30,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_plans_code UNIQUE (code),
  CONSTRAINT chk_plans_code CHECK (code IN ('free', 'pro', 'team')),
  CONSTRAINT chk_plans_prices CHECK (monthly_price >= 0 AND yearly_price >= 0),
  CONSTRAINT chk_plans_retention CHECK (analytics_retention_days > 0)
);
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON billing.plans
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

CREATE TABLE billing.subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL,        -- * cross-schema logical FK -> core.workspaces.id
  plan_id                 UUID NOT NULL REFERENCES billing.plans (id) ON DELETE RESTRICT,
  stripe_customer_id      VARCHAR(255),
  stripe_subscription_id  VARCHAR(255),
  status                  VARCHAR(15) NOT NULL DEFAULT 'trialing',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  grace_period_end        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_subscriptions_workspace_id UNIQUE (workspace_id),                         -- BR-R03
  CONSTRAINT uq_subscriptions_stripe_subscription_id UNIQUE (stripe_subscription_id),
  CONSTRAINT chk_subscriptions_status CHECK (status IN ('trialing', 'active', 'grace_period', 'cancelled')),  -- BR-F05
  CONSTRAINT chk_subscriptions_grace_period CHECK ((status = 'grace_period') = (grace_period_end IS NOT NULL))  -- BR-F07
);
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON billing.subscriptions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE INDEX idx_subscriptions_plan_id ON billing.subscriptions (plan_id);
CREATE INDEX idx_subscriptions_status ON billing.subscriptions (status);

CREATE TABLE billing.billing_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  VARCHAR(255) NOT NULL,
  event_type       VARCHAR(100) NOT NULL,
  event_payload    JSONB NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL,
  subscription_id  UUID REFERENCES billing.subscriptions (id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_billing_events_stripe_event_id UNIQUE (stripe_event_id)                    -- BR-R04
);
CREATE INDEX idx_billing_events_subscription_id ON billing.billing_events (subscription_id);
CREATE INDEX idx_billing_events_occurred_at ON billing.billing_events (occurred_at);

-- =============================================================================
-- SCHEMA: analytics  (analytics-service)
-- =============================================================================

CREATE TABLE analytics.post_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL,                   -- * cross-schema logical FK -> core.posts.id
  metric_date  DATE NOT NULL,
  reach        INTEGER NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  likes        INTEGER NOT NULL DEFAULT 0,
  comments     INTEGER NOT NULL DEFAULT 0,
  shares       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_post_metrics_post_date UNIQUE (post_id, metric_date),                      -- BR-R07
  CONSTRAINT chk_post_metrics_non_negative CHECK (
    reach >= 0 AND impressions >= 0 AND likes >= 0 AND comments >= 0 AND shares >= 0
  )
);
CREATE INDEX idx_post_metrics_post_id ON analytics.post_metrics (post_id);
CREATE INDEX idx_post_metrics_metric_date ON analytics.post_metrics (metric_date);

-- =============================================================================
-- SCHEMA: notification  (notification-service)
-- =============================================================================

CREATE TABLE notification.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                   -- * cross-schema logical FK -> core.workspaces.id
  type          VARCHAR(50) NOT NULL,
  title         VARCHAR(150) NOT NULL,
  message       TEXT NOT NULL,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_workspace_id ON notification.notifications (workspace_id);

CREATE TABLE notification.notification_recipients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id  UUID NOT NULL REFERENCES notification.notifications (id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,                -- * cross-schema logical FK -> core.users.id
  read_status      BOOLEAN NOT NULL DEFAULT false,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_recipient UNIQUE (notification_id, user_id)
);
CREATE INDEX idx_notification_recipients_user_id ON notification.notification_recipients (user_id);
CREATE INDEX idx_notification_recipients_unread ON notification.notification_recipients (user_id) WHERE read_status = false;

-- BR-F08: read_status/read_at can only move from unread -> read, never back.
CREATE OR REPLACE FUNCTION notification.recipients_guard_one_way_read()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.read_status = true AND NEW.read_status = false THEN
    RAISE EXCEPTION 'notification_recipients.read_status cannot revert to unread (BR-F08)';
  END IF;
  IF NEW.read_status = true AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_recipients_guard_one_way_read
  BEFORE UPDATE ON notification.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION notification.recipients_guard_one_way_read();

-- =============================================================================
-- SCHEMA: email  (email-service)
-- =============================================================================

CREATE TABLE email.email_delivery_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID,                    -- * cross-schema logical FK -> core.workspaces.id
  user_id               UUID,                    -- * cross-schema logical FK -> core.users.id
  email_type            VARCHAR(50) NOT NULL,
  recipient_email       VARCHAR(255) NOT NULL,
  template_name         VARCHAR(100) NOT NULL,
  provider              VARCHAR(30) NOT NULL,
  status                VARCHAR(15) NOT NULL DEFAULT 'pending',
  dedupe_key            VARCHAR(255) NOT NULL,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  related_entity_type   VARCHAR(100),
  related_entity_id     UUID,
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_delivery_logs_dedupe_key UNIQUE (dedupe_key),                        -- BR-R08
  CONSTRAINT chk_email_delivery_logs_type CHECK (
    email_type IN ('invitation', 'publish_success', 'publish_failed', 'token_expiring', 'payment_failed')
  ),
  CONSTRAINT chk_email_delivery_logs_status CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT chk_email_delivery_logs_provider CHECK (provider IN ('Resend', 'SES', 'SendGrid'))
);
CREATE INDEX idx_email_delivery_logs_workspace_id ON email.email_delivery_logs (workspace_id);
CREATE INDEX idx_email_delivery_logs_user_id ON email.email_delivery_logs (user_id);
CREATE INDEX idx_email_delivery_logs_status ON email.email_delivery_logs (status);

-- =============================================================================
-- SCHEMA: messaging  (shared infra — libs/rabbitmq + libs/database)
-- =============================================================================

CREATE TABLE messaging.event_message_logs (
  event_id          UUID PRIMARY KEY,             -- assigned by the publisher, not a DB default
  event_type        VARCHAR(100) NOT NULL,
  exchange_name     VARCHAR(100) NOT NULL,
  routing_key       VARCHAR(150) NOT NULL,
  processing_status VARCHAR(15) NOT NULL DEFAULT 'pending',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  payload           JSONB NOT NULL,
  result            JSONB,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_event_message_logs_status CHECK (processing_status IN ('pending', 'processed', 'failed', 'dlq'))
);
CREATE INDEX idx_event_message_logs_status ON messaging.event_message_logs (processing_status);
CREATE INDEX idx_event_message_logs_event_type ON messaging.event_message_logs (event_type);

-- NOTE: event_id FK is ON DELETE RESTRICT — an event_message_logs row with a DLQ
-- child can never be purged. High-volume infra table; needs a retention/archival
-- job (e.g. drop DLQ + log rows older than N days in one transaction).
CREATE TABLE messaging.dead_letter_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES messaging.event_message_logs (event_id) ON DELETE RESTRICT,
  error_message   TEXT NOT NULL,
  retry_count     INTEGER NOT NULL,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed_at  TIMESTAMPTZ,
  CONSTRAINT uq_dead_letter_messages_event_id UNIQUE (event_id)                            -- BR-R09
);

-- =============================================================================
-- Done.
-- =============================================================================
