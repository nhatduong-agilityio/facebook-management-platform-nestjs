-- =============================================================================
-- Facebook Creator Platform — NestJS Practice
-- Query Collection — answers to a set of realistic business questions.
-- Run after 01-ddl-schema.sql + 05-views.sql + (optionally) 03-seed-data.js.
-- =============================================================================

-- =============================================================================
-- Q1. List every workspace with its current plan and subscription status.
-- =============================================================================
SELECT workspace_name, plan_name, subscription_status, subscription_active, days_until_renewal
FROM core.vw_workspace_billing_overview
ORDER BY workspace_name;

-- =============================================================================
-- Q2. Top 10 posts by total engagement (likes + comments + shares), all time.
-- =============================================================================
SELECT
  p.id AS post_id,
  p.title,
  w.name AS workspace_name,
  sum(pme.engagement_total) AS total_engagement,
  sum(pme.reach) AS total_reach
FROM core.vw_post_metrics_enriched pme
JOIN core.posts p ON p.id = pme.post_id
JOIN core.workspaces w ON w.id = p.workspace_id
GROUP BY p.id, p.title, w.name
ORDER BY total_engagement DESC
LIMIT 10;

-- =============================================================================
-- Q3. Which workspaces have more than 5 unread notifications, right now?
-- =============================================================================
SELECT
  w.name AS workspace_name,
  count(*) AS unread_count
FROM notification.vw_notification_inbox ni
JOIN core.workspaces w ON w.id = ni.workspace_id
GROUP BY w.name
HAVING count(*) > 5
ORDER BY unread_count DESC;

-- =============================================================================
-- Q4. Email delivery success rate by provider.
-- =============================================================================
SELECT
  provider,
  count(*) AS total_sent_attempts,
  sum((email_success)::int) AS successful,
  round(100.0 * sum((email_success)::int) / count(*), 1) AS success_rate_pct
FROM email.vw_email_delivery_overview
GROUP BY provider
ORDER BY success_rate_pct DESC;

-- =============================================================================
-- Q5. How many messages are currently in the Dead Letter Queue, grouped by
--     event type — the operational triage view.
-- =============================================================================
SELECT
  event_type,
  count(*) AS dlq_count,
  count(*) FILTER (WHERE reprocessed_at IS NOT NULL) AS already_reprocessed,
  count(*) FILTER (WHERE reprocessed_at IS NULL) AS still_pending
FROM messaging.vw_event_message_overview
WHERE moved_to_dlq
GROUP BY event_type
ORDER BY dlq_count DESC;

-- =============================================================================
-- Q6. Which connected Facebook Pages have a token expiring within 3 days
--     (or already expired) — the proactive token-refresh worklist.
-- =============================================================================
SELECT
  fa.page_name,
  w.name AS workspace_name,
  fa.token_expires_at,
  fa.token_expired,
  (fa.token_expires_at::date - CURRENT_DATE) AS days_until_expiry
FROM core.vw_facebook_accounts_overview fa
JOIN core.workspaces w ON w.id = fa.workspace_id
WHERE fa.token_expires_at IS NOT NULL
  AND fa.token_expires_at <= now() + INTERVAL '3 days'
ORDER BY fa.token_expires_at ASC;

-- =============================================================================
-- Q7. Average publish delay (scheduled_at -> published_at) per workspace,
--     for posts that were actually scheduled ahead of time.
-- =============================================================================
SELECT
  workspace_name,
  count(*) AS scheduled_and_published,
  avg(publish_delay) AS avg_publish_delay
FROM core.vw_post_summary
WHERE status = 'published' AND scheduled_at IS NOT NULL
GROUP BY workspace_name
ORDER BY avg_publish_delay DESC;

-- =============================================================================
-- Q8. Workspaces currently in their billing grace period, soonest-expiring first
--     — the "about to lose access" worklist for the billing team.
-- =============================================================================
SELECT
  workspace_name,
  plan_name,
  grace_period_end,
  days_remaining_in_grace
FROM core.vw_workspace_billing_overview
WHERE subscription_status = 'grace_period'
ORDER BY days_remaining_in_grace ASC;

-- =============================================================================
-- Q9. Which user has sent the most team invitations, across all workspaces?
-- =============================================================================
SELECT
  u.full_name,
  u.email,
  count(*) AS invitations_sent
FROM core.invitations i
JOIN core.users u ON u.id = i.invited_by_user_id
GROUP BY u.full_name, u.email
ORDER BY invitations_sent DESC
LIMIT 10;

-- =============================================================================
-- Q10. Daily reach trend for a single post over its lifetime (parameterised —
--      replace the post_id literal, or wrap this in a prepared statement).
-- =============================================================================
SELECT
  metric_date,
  reach,
  impressions,
  engagement_total,
  engagement_rate
FROM core.vw_post_metrics_enriched
WHERE post_id = (SELECT id FROM core.posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 1)
ORDER BY metric_date ASC;

-- =============================================================================
-- Q11. Posts that failed to publish in the last 7 days, with page + workspace
--      context — the incident triage list.
-- =============================================================================
SELECT
  p.id AS post_id,
  w.name AS workspace_name,
  fa.page_name,
  p.last_error,
  p.updated_at AS failed_at
FROM core.posts p
JOIN core.workspaces w ON w.id = p.workspace_id
LEFT JOIN core.facebook_accounts fa ON fa.id = p.facebook_account_id
WHERE p.status = 'failed'
  AND p.updated_at >= now() - INTERVAL '7 days'
ORDER BY p.updated_at DESC;

-- =============================================================================
-- Q12. Projected monthly recurring revenue (MRR) from active, non-free
--      subscriptions.
-- =============================================================================
SELECT
  pl.code AS plan_code,
  count(*) AS active_subscriptions,
  sum(pl.monthly_price) AS mrr
FROM billing.subscriptions s
JOIN billing.plans pl ON pl.id = s.plan_id
WHERE s.status = 'active' AND pl.code <> 'free'
GROUP BY pl.code
ORDER BY mrr DESC;

-- =============================================================================
-- Q13. Workspace member role distribution across the whole platform —
--      "how many Owners/Editors/Viewers do we have overall?"
-- =============================================================================
SELECT role, count(*) AS member_count
FROM core.workspace_members
GROUP BY role
ORDER BY member_count DESC;

-- =============================================================================
-- Q14. The 5 most active workspaces by post count in the last 30 days.
-- =============================================================================
SELECT
  w.name AS workspace_name,
  count(*) AS posts_last_30_days
FROM core.posts p
JOIN core.workspaces w ON w.id = p.workspace_id
WHERE p.created_at >= now() - INTERVAL '30 days'
GROUP BY w.name
ORDER BY posts_last_30_days DESC
LIMIT 5;

-- =============================================================================
-- Q15. Audit trail for a given entity type in the last 24 hours — the
--      "what changed overnight" report (parameterised by entity_type).
-- =============================================================================
SELECT
  al.created_at,
  u.full_name AS actor,
  al.action,
  al.entity_type,
  al.entity_id
FROM core.audit_logs al
LEFT JOIN core.users u ON u.id = al.actor_user_id
WHERE al.entity_type = 'post'
  AND al.created_at >= now() - INTERVAL '24 hours'
ORDER BY al.created_at DESC;

-- =============================================================================
-- Q16. Free-plan workspaces that are close to (or over) their post limit —
--      the upgrade-prompt worklist.
-- =============================================================================
SELECT
  w.name AS workspace_name,
  pl.post_limit,
  count(p.id) AS posts_created,
  (pl.post_limit - count(p.id)) AS posts_remaining
FROM core.workspaces w
JOIN billing.subscriptions s ON s.workspace_id = w.id
JOIN billing.plans pl ON pl.id = s.plan_id
JOIN core.posts p ON p.workspace_id = w.id
WHERE pl.code = 'free' AND pl.post_limit > 0
GROUP BY w.name, pl.post_limit
HAVING count(p.id) >= pl.post_limit * 0.8
ORDER BY posts_remaining ASC;
