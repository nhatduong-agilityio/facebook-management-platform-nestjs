-- =============================================================================
-- Facebook Creator Platform — NestJS Practice
-- Run these checks AFTER seeding (03-seed-data.js) to verify everything.
--
-- How to read the output:
--   Section 1 — row counts per table, just for a sanity glance.
--   Section 2 — one row per check, "violations" column MUST be 0 for every
--               row. Anything > 0 means the seed (or a manual data fix)
--               broke a Phase 5 business rule or left a dangling reference.
--   Section 3 — a single PASS/FAIL rollup of Section 2.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Row counts per table
-- -----------------------------------------------------------------------------
SELECT 'core.users' AS table_name, count(*) AS row_count FROM core.users
UNION ALL SELECT 'core.workspaces', count(*) FROM core.workspaces
UNION ALL SELECT 'core.workspace_members', count(*) FROM core.workspace_members
UNION ALL SELECT 'core.invitations', count(*) FROM core.invitations
UNION ALL SELECT 'core.facebook_accounts', count(*) FROM core.facebook_accounts
UNION ALL SELECT 'core.posts', count(*) FROM core.posts
-- core.audit_logs does not exist in Postgres — audit records live in MongoDB
-- audit_events collection in services/audit (ADR-047, T5.2 confirmed).
UNION ALL SELECT 'billing.plans', count(*) FROM billing.plans
UNION ALL SELECT 'billing.subscriptions', count(*) FROM billing.subscriptions
UNION ALL SELECT 'billing.billing_events', count(*) FROM billing.billing_events
UNION ALL SELECT 'analytics.post_metrics', count(*) FROM analytics.post_metrics
UNION ALL SELECT 'notification.notifications', count(*) FROM notification.notifications
UNION ALL SELECT 'notification.notification_recipients', count(*) FROM notification.notification_recipients
UNION ALL SELECT 'email.email_delivery_logs', count(*) FROM email.email_delivery_logs
UNION ALL SELECT 'messaging.event_message_logs', count(*) FROM messaging.event_message_logs
UNION ALL SELECT 'messaging.dead_letter_messages', count(*) FROM messaging.dead_letter_messages
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- 2. Business-rule + referential-soundness checks (violations must be 0)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp.checks;
CREATE TEMP TABLE pg_temp.checks AS

-- ---- Phase 5 business rules ---------------------------------------------------

-- BR-F09 / BR-R02: every workspace has exactly one 'owner' member
SELECT
  'BR-F09/BR-R02: workspace has exactly 1 owner' AS check_name,
  count(*) AS violations
FROM (
  SELECT w.id
  FROM core.workspaces w
  LEFT JOIN core.workspace_members wm ON wm.workspace_id = w.id AND wm.role = 'owner'
  GROUP BY w.id
  HAVING count(wm.id) <> 1
) v

UNION ALL
-- BR-R01: a user has at most one membership per workspace
SELECT 'BR-R01: unique (workspace_id, user_id) in workspace_members', count(*)
FROM (
  SELECT workspace_id, user_id FROM core.workspace_members
  GROUP BY workspace_id, user_id HAVING count(*) > 1
) v

UNION ALL
-- BR-F03b: invitation role is never 'owner'
SELECT 'BR-F03b: invitations.role never owner', count(*)
FROM core.invitations WHERE role NOT IN ('editor', 'viewer')

UNION ALL
-- BR-F02: post content length 1..63206
SELECT 'BR-F02: posts.content length within bounds', count(*)
FROM core.posts WHERE char_length(content) NOT BETWEEN 1 AND 63206

UNION ALL
-- BR-F06: scheduled posts have a future scheduled_at
SELECT 'BR-F06: scheduled posts have future scheduled_at', count(*)
FROM core.posts WHERE status = 'scheduled' AND (scheduled_at IS NULL OR scheduled_at <= now())

UNION ALL
-- BR-R05: posts.facebook_account_id belongs to the same workspace as the post
SELECT 'BR-R05: post facebook_account_id matches post workspace', count(*)
FROM core.posts p
JOIN core.facebook_accounts fa ON fa.id = p.facebook_account_id
WHERE fa.workspace_id <> p.workspace_id

UNION ALL
-- BR-F07: grace_period_end set iff status = grace_period
SELECT 'BR-F07: subscriptions.grace_period_end <=> status=grace_period', count(*)
FROM billing.subscriptions
WHERE (status = 'grace_period') <> (grace_period_end IS NOT NULL)

UNION ALL
-- Semantic guard: a 'free' plan workspace should never be in grace_period
-- (no Stripe customer, nothing to be past-due on).
SELECT 'SEM: free-plan subscriptions are never grace_period', count(*)
FROM billing.subscriptions s
JOIN billing.plans pl ON pl.id = s.plan_id
WHERE pl.code = 'free' AND s.status = 'grace_period'

UNION ALL
-- BR-R03: a workspace has at most one subscription
SELECT 'BR-R03: subscriptions.workspace_id is unique', count(*)
FROM (SELECT workspace_id FROM billing.subscriptions GROUP BY workspace_id HAVING count(*) > 1) v

UNION ALL
-- BR-R07: at most one metric snapshot per (post, day)
SELECT 'BR-R07: unique (post_id, metric_date) in post_metrics', count(*)
FROM (SELECT post_id, metric_date FROM analytics.post_metrics GROUP BY post_id, metric_date HAVING count(*) > 1) v

UNION ALL
-- BR-F08: a read recipient always has read_at set, and vice versa
SELECT 'BR-F08: read_status <=> read_at IS NOT NULL', count(*)
FROM notification.notification_recipients
WHERE read_status <> (read_at IS NOT NULL)

UNION ALL
-- BR-R08: dedupe_key is unique
SELECT 'BR-R08: email_delivery_logs.dedupe_key is unique', count(*)
FROM (SELECT dedupe_key FROM email.email_delivery_logs GROUP BY dedupe_key HAVING count(*) > 1) v

UNION ALL
-- BR-R09: a message only reaches DLQ after exceeding the retry threshold (here: >=5),
-- and dead_letter_messages.event_id is unique
SELECT 'BR-R09: dead_letter_messages.event_id is unique', count(*)
FROM (SELECT event_id FROM messaging.dead_letter_messages GROUP BY event_id HAVING count(*) > 1) v

UNION ALL
SELECT 'BR-R09: every DLQ event has processing_status = dlq on its log row', count(*)
FROM messaging.dead_letter_messages dlm
JOIN messaging.event_message_logs eml ON eml.event_id = dlm.event_id
WHERE eml.processing_status <> 'dlq'

UNION ALL
-- BR-R09 (the actual rule): a message only reaches the DLQ after exceeding the retry
-- threshold (configured maximum = 5). Previously asserted in a comment but never checked.
SELECT 'BR-R09: DLQ only after retry_count >= 5', count(*)
FROM messaging.dead_letter_messages dlm
JOIN messaging.event_message_logs eml ON eml.event_id = dlm.event_id
WHERE eml.retry_count < 5

-- ---- Cross-schema referential soundness (no DB FK, per BR-R06 — verify in application/test code instead) ----

UNION ALL
SELECT 'orphan: workspaces.owner_user_id -> users.id', count(*)
FROM core.workspaces w WHERE NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = w.owner_user_id)

UNION ALL
SELECT 'orphan: workspace_members.user_id -> users.id', count(*)
FROM core.workspace_members wm WHERE NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = wm.user_id)

UNION ALL
SELECT 'orphan: invitations.invited_by_user_id -> users.id', count(*)
FROM core.invitations i WHERE NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = i.invited_by_user_id)

UNION ALL
SELECT 'orphan: posts.created_by_user_id -> users.id', count(*)
FROM core.posts p WHERE NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = p.created_by_user_id)

UNION ALL
SELECT 'orphan: subscriptions.workspace_id -> workspaces.id (cross-schema)', count(*)
FROM billing.subscriptions s WHERE NOT EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = s.workspace_id)

UNION ALL
SELECT 'orphan: post_metrics.post_id -> posts.id (cross-schema)', count(*)
FROM analytics.post_metrics pm WHERE NOT EXISTS (SELECT 1 FROM core.posts p WHERE p.id = pm.post_id)

UNION ALL
SELECT 'orphan: notifications.workspace_id -> workspaces.id (cross-schema)', count(*)
FROM notification.notifications n WHERE NOT EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = n.workspace_id)

UNION ALL
SELECT 'orphan: notification_recipients.user_id -> users.id (cross-schema)', count(*)
FROM notification.notification_recipients nr WHERE NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = nr.user_id)

UNION ALL
SELECT 'orphan: email_delivery_logs.workspace_id -> workspaces.id (cross-schema, nullable)', count(*)
FROM email.email_delivery_logs e
WHERE e.workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = e.workspace_id)

UNION ALL
SELECT 'orphan: email_delivery_logs.user_id -> users.id (cross-schema, nullable)', count(*)
FROM email.email_delivery_logs e
WHERE e.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = e.user_id)
;

TABLE pg_temp.checks ORDER BY violations DESC, check_name;

-- -----------------------------------------------------------------------------
-- 3. Rollup
-- -----------------------------------------------------------------------------
SELECT
  CASE WHEN sum(violations) = 0 THEN 'PASS — all checks clean' ELSE 'FAIL — see rows above with violations > 0' END AS result,
  count(*) AS checks_run,
  sum(violations) AS total_violations
FROM pg_temp.checks;
