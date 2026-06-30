-- =============================================================================
-- Facebook Creator Platform — NestJS Practice
-- All Views — generated from docs/04-Database-Design.docx (Phase 6)
--
-- Run after 01-ddl-schema.sql. Every calculated field listed in the design
-- doc's Phase 2/6 "Calculated Field List" is hosted by exactly one view here.
-- =============================================================================

-- ---- vw_workspace_members_detail --------------------------------------------
-- Calculated: is_owner
CREATE OR REPLACE VIEW core.vw_workspace_members_detail AS
SELECT
  wm.id            AS membership_id,
  wm.workspace_id,
  w.name           AS workspace_name,
  wm.user_id,
  u.full_name,
  u.email,
  wm.role,
  (wm.role = 'owner') AS is_owner,
  wm.invited_at,
  wm.accepted_at,
  wm.joined_at
FROM core.workspace_members wm
JOIN core.workspaces w ON w.id = wm.workspace_id
JOIN core.users u ON u.id = wm.user_id;

-- ---- vw_invitations_overview -------------------------------------------------
-- Calculated: invitation_expired · Filter: status = pending
CREATE OR REPLACE VIEW core.vw_invitations_overview AS
SELECT
  i.id,
  i.workspace_id,
  w.name AS workspace_name,
  i.email,
  i.role,
  i.status,
  i.expires_at,
  (now() > i.expires_at) AS invitation_expired,
  i.created_at
FROM core.invitations i
JOIN core.workspaces w ON w.id = i.workspace_id
WHERE i.status = 'pending';

-- ---- vw_facebook_accounts_overview ------------------------------------------
-- Calculated: token_expired
CREATE OR REPLACE VIEW core.vw_facebook_accounts_overview AS
SELECT
  fa.id,
  fa.workspace_id,
  w.name AS workspace_name,
  fa.page_id,
  fa.page_name,
  fa.token_expires_at,
  (fa.token_expires_at IS NOT NULL AND now() > fa.token_expires_at) AS token_expired,
  fa.connected_at
FROM core.facebook_accounts fa
JOIN core.workspaces w ON w.id = fa.workspace_id;

-- ---- vw_post_summary ----------------------------------------------------------
-- Calculated: publish_delay · Filter: status IN (scheduled, published)
CREATE OR REPLACE VIEW core.vw_post_summary AS
SELECT
  p.id,
  p.workspace_id,
  w.name           AS workspace_name,
  p.facebook_account_id,
  fa.page_name,
  p.created_by_user_id,
  p.title,
  p.status,
  p.scheduled_at,
  p.published_at,
  (p.published_at - p.scheduled_at) AS publish_delay,
  p.created_at
FROM core.posts p
JOIN core.workspaces w ON w.id = p.workspace_id
LEFT JOIN core.facebook_accounts fa ON fa.id = p.facebook_account_id
WHERE p.status IN ('scheduled', 'published');

-- ---- vw_post_metrics_enriched -------------------------------------------------
-- Calculated: engagement_total, engagement_rate · crosses core/analytics (read-only)
CREATE OR REPLACE VIEW core.vw_post_metrics_enriched AS
SELECT
  pm.id            AS metric_id,
  pm.post_id,
  p.workspace_id,
  pm.metric_date,
  pm.reach,
  pm.impressions,
  pm.likes,
  pm.comments,
  pm.shares,
  (pm.likes + pm.comments + pm.shares) AS engagement_total,
  ROUND((pm.likes + pm.comments + pm.shares)::numeric / NULLIF(pm.reach, 0), 4) AS engagement_rate
FROM analytics.post_metrics pm
JOIN core.posts p ON p.id = pm.post_id;

-- ---- vw_workspace_billing_overview --------------------------------------------
-- Calculated: subscription_active, days_until_renewal, days_remaining_in_grace
-- Crosses core/billing (read-only)
CREATE OR REPLACE VIEW core.vw_workspace_billing_overview AS
SELECT
  w.id              AS workspace_id,
  w.name            AS workspace_name,
  pl.code           AS plan_code,
  pl.name           AS plan_name,
  s.status          AS subscription_status,
  (s.status IN ('trialing', 'active', 'grace_period')) AS subscription_active,
  (s.current_period_end::date - CURRENT_DATE)  AS days_until_renewal,
  (s.grace_period_end::date - CURRENT_DATE)    AS days_remaining_in_grace,
  s.current_period_end,
  s.grace_period_end
FROM core.workspaces w
JOIN billing.subscriptions s ON s.workspace_id = w.id
JOIN billing.plans pl ON pl.id = s.plan_id;

-- ---- vw_email_delivery_overview -----------------------------------------------
-- Calculated: email_success
CREATE OR REPLACE VIEW email.vw_email_delivery_overview AS
SELECT
  id,
  workspace_id,
  user_id,
  email_type,
  recipient_email,
  provider,
  status,
  (status = 'sent') AS email_success,
  retry_count,
  sent_at,
  created_at
FROM email.email_delivery_logs;

-- ---- vw_event_message_overview ------------------------------------------------
-- Calculated: moved_to_dlq
CREATE OR REPLACE VIEW messaging.vw_event_message_overview AS
SELECT
  eml.event_id,
  eml.event_type,
  eml.exchange_name,
  eml.routing_key,
  eml.processing_status,
  eml.retry_count,
  (eml.processing_status = 'dlq') AS moved_to_dlq,
  dlm.error_message,
  dlm.reprocessed_at,
  eml.created_at
FROM messaging.event_message_logs eml
LEFT JOIN messaging.dead_letter_messages dlm ON dlm.event_id = eml.event_id;

-- ---- vw_notification_inbox -----------------------------------------------------
-- Filter: read_status = false
CREATE OR REPLACE VIEW notification.vw_notification_inbox AS
SELECT
  nr.id            AS recipient_row_id,
  nr.user_id,
  n.workspace_id,
  n.id             AS notification_id,
  n.type,
  n.title,
  n.message,
  n.payload,
  n.created_at
FROM notification.notification_recipients nr
JOIN notification.notifications n ON n.id = nr.notification_id
WHERE nr.read_status = false;

-- ---- vw_analytics_overview -----------------------------------------------------
-- Aggregate: total_likes, total_comments, total_shares, total_impressions, total_reach
-- grouped by workspace_id · crosses core/analytics (read-only)
CREATE OR REPLACE VIEW analytics.vw_analytics_overview AS
SELECT
  p.workspace_id,
  count(DISTINCT p.id)        AS post_count,
  sum(pm.likes)                AS total_likes,
  sum(pm.comments)             AS total_comments,
  sum(pm.shares)                AS total_shares,
  sum(pm.impressions)          AS total_impressions,
  sum(pm.reach)                 AS total_reach
FROM analytics.post_metrics pm
JOIN core.posts p ON p.id = pm.post_id
GROUP BY p.workspace_id;
