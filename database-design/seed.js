#!/usr/bin/env node
/**
 * Facebook Creator Platform — NestJS Practice
 * 03-seed-data.js — seeds the schema created by 01-ddl-schema.sql with
 * realistic, foreign-key-consistent fake data.
 *
 * Usage:
 *   cd db && npm install
 *   DATABASE_URL=postgres://fcp:fcp_dev_password@localhost:5432/fcp npm run seed
 *
 * Design:
 *   - posts is the "main table" — exactly POST_COUNT (default 1000) rows.
 *     Every other table's volume is derived proportionally from it, the
 *     same way the real system would grow (more posts -> more metrics,
 *     more notifications, more audit log entries, ...).
 *   - Everything is generated in dependency order and kept in memory as
 *     plain arrays of JS objects, then bulk-inserted with chunked
 *     multi-row INSERTs (fast, no ORM, no extra round-trips).
 *   - Cross-schema columns (workspace_id on billing.subscriptions, etc.)
 *     are filled with real ids from core - exactly like the running
 *     system would do via domain events - even though the DB itself
 *     enforces no FK constraint across schemas (see BR-R06).
 */

require("dotenv").config();
const { Pool } = require("pg");
const { faker } = require("@faker-js/faker");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://fcp:fcp_dev_password@localhost:5432/fcp";

const POST_COUNT = parseInt(process.env.SEED_POST_COUNT || "1000", 10);
const USER_COUNT = Math.max(40, Math.round(POST_COUNT * 0.05)); // ~50 for 1000 posts
const WORKSPACE_COUNT = Math.max(10, Math.round(POST_COUNT * 0.02)); // ~20 for 1000 posts
const CHUNK_SIZE = 500; // rows per multi-row INSERT statement

const pool = new Pool({ connectionString: DATABASE_URL });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const uuid = () => faker.string.uuid();
const pick = (arr) => faker.helpers.arrayElement(arr);
const pickWeighted = (weighted) => faker.helpers.weightedArrayElement(weighted);
const maybe = (probability, value, otherwise = null) =>
  Math.random() < probability ? value : otherwise;
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size)
    out.push(array.slice(i, i + size));
  return out;
}

/** Bulk insert helper: builds one parameterised multi-row INSERT per chunk. */
async function insertRows(client, table, columns, rows) {
  if (rows.length === 0) return;
  for (const part of chunk(rows, CHUNK_SIZE)) {
    const values = [];
    const placeholders = part
      .map((row, rowIdx) => {
        const base = rowIdx * columns.length;
        const tuple = columns
          .map((_, colIdx) => `$${base + colIdx + 1}`)
          .join(", ");
        columns.forEach((col) => values.push(row[col]));
        return `(${tuple})`;
      })
      .join(",\n       ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n       ${placeholders}`;
    await client.query(sql, values);
  }
}

// ---------------------------------------------------------------------------
// Generators — one per table, returning plain-object rows
// ---------------------------------------------------------------------------

function genUsers(count) {
  return Array.from({ length: count }, () => ({
    id: uuid(),
    clerk_user_id: `user_${faker.string.alphanumeric(20)}`,
    email: faker.internet.email().toLowerCase(),
    full_name: faker.person.fullName(),
    avatar_url: maybe(0.7, faker.image.avatarGitHub()),
    status: pickWeighted([
      { value: "active", weight: 9 },
      { value: "inactive", weight: 1 },
    ]),
    created_at: faker.date.past({ years: 2 }),
  }));
}

function genWorkspaces(count, users) {
  return Array.from({ length: count }, () => ({
    id: uuid(),
    name: faker.company.name(),
    slug:
      faker.helpers.slugify(faker.company.name()).toLowerCase() +
      "-" +
      faker.string.alphanumeric(4),
    description: maybe(0.6, faker.company.catchPhrase()),
    status: pickWeighted([
      { value: "active", weight: 19 },
      { value: "suspended", weight: 1 },
    ]),
    owner_user_id: pick(users).id,
    created_at: faker.date.past({ years: 2 }),
  }));
}

/** Every workspace gets exactly one 'owner' (its owner_user_id) plus 1-5 other members. */
function genWorkspaceMembers(workspaces, users) {
  const rows = [];
  for (const ws of workspaces) {
    rows.push({
      id: uuid(),
      workspace_id: ws.id,
      user_id: ws.owner_user_id,
      role: "owner",
      invited_at: null,
      accepted_at: ws.created_at,
      joined_at: ws.created_at,
    });

    const memberCount = faker.number.int({ min: 1, max: 5 });
    const candidates = faker.helpers.arrayElements(
      users.filter((u) => u.id !== ws.owner_user_id),
      memberCount,
    );
    for (const u of candidates) {
      const invitedAt = faker.date.between({
        from: ws.created_at,
        to: new Date(),
      });
      rows.push({
        id: uuid(),
        workspace_id: ws.id,
        user_id: u.id,
        role: pickWeighted([
          { value: "editor", weight: 2 },
          { value: "viewer", weight: 1 },
        ]),
        invited_at: invitedAt,
        accepted_at: invitedAt,
        joined_at: invitedAt,
      });
    }
  }
  return rows;
}

function genInvitations(workspaces, ownerByWorkspace) {
  const rows = [];
  for (const ws of workspaces) {
    const count = faker.number.int({ min: 0, max: 3 });
    for (let i = 0; i < count; i++) {
      const status = pickWeighted([
        { value: "pending", weight: 3 },
        { value: "accepted", weight: 4 },
        { value: "expired", weight: 2 },
        { value: "revoked", weight: 1 },
      ]);
      const createdAt = faker.date.between({
        from: ws.created_at,
        to: new Date(),
      });
      rows.push({
        id: uuid(),
        workspace_id: ws.id,
        email: faker.internet.email().toLowerCase(),
        role: pick(["editor", "viewer"]),
        token: faker.string.alphanumeric(48),
        status,
        invited_by_user_id: ownerByWorkspace.get(ws.id),
        expires_at: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        created_at: createdAt,
      });
    }
  }
  return rows;
}

function genFacebookAccounts(workspaces) {
  const rows = [];
  for (const ws of workspaces) {
    const count = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < count; i++) {
      const connectedAt = faker.date.between({
        from: ws.created_at,
        to: new Date(),
      });
      rows.push({
        id: uuid(),
        workspace_id: ws.id,
        page_id: faker.string.numeric(16),
        page_name: `${faker.company.name()} Page`,
        access_token: `EAA${faker.string.alphanumeric(120)}`,
        token_expires_at: maybe(
          0.8,
          daysFromNow(faker.number.int({ min: -5, max: 60 })),
        ),
        connected_at: connectedAt,
        updated_at: connectedAt,
      });
    }
  }
  return rows;
}

const POST_STATUS_WEIGHTS = [
  { value: "draft", weight: 2 },
  { value: "scheduled", weight: 1 },
  { value: "published", weight: 6 },
  { value: "failed", weight: 1 },
];

function genPosts(count, workspaces, accountsByWorkspace, membersByWorkspace) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const ws = pick(workspaces);
    const accounts = accountsByWorkspace.get(ws.id) || [];
    const authors = membersByWorkspace.get(ws.id) || [ws.owner_user_id];
    const status = pickWeighted(POST_STATUS_WEIGHTS);
    const createdAt = faker.date.between({
      from: ws.created_at,
      to: new Date(),
    });

    let scheduledAt = null;
    let publishedAt = null;
    let lastError = null;
    let facebookGraphPostId = null;

    if (status === "scheduled") {
      scheduledAt = daysFromNow(faker.number.int({ min: 1, max: 30 }));
    } else if (status === "published") {
      publishedAt = faker.date.between({ from: createdAt, to: new Date() });
      facebookGraphPostId = `${faker.string.numeric(16)}_${faker.string.numeric(16)}`;
      // ~50% of published posts went through the scheduled flow first - the
      // schedule time is kept (not nulled out) once the worker publishes it,
      // so it stays available for publish-delay reporting (Q7).
      scheduledAt = maybe(
        0.5,
        new Date(
          publishedAt.getTime() -
            faker.number.int({ min: 1, max: 6 * 60 }) * 60 * 1000,
        ),
      );
    } else if (status === "failed") {
      lastError = pick([
        "Graph API error: token expired",
        "Graph API error: page access revoked",
        "Rate limited by Facebook Graph API",
        "Network timeout while publishing",
      ]);
    }

    rows.push({
      id: uuid(),
      workspace_id: ws.id,
      facebook_account_id: accounts.length ? pick(accounts).id : null,
      created_by_user_id: pick(authors),
      title: maybe(0.5, faker.lorem.sentence({ min: 3, max: 8 })),
      // ~0.5% of posts use a near-max body to exercise the BR-F02 upper bound (63,206)
      content:
        Math.random() < 0.005
          ? faker.lorem.paragraphs(400, "\n\n").slice(0, 63000)
          : faker.lorem.paragraphs({ min: 1, max: 3 }, "\n\n").slice(0, 2000),
      media_url: maybe(0.4, faker.image.urlPicsumPhotos()),
      status,
      facebook_graph_post_id: facebookGraphPostId,
      scheduled_at: scheduledAt,
      published_at: publishedAt,
      last_error: lastError,
      created_at: createdAt,
      updated_at: publishedAt || createdAt,
    });
  }
  return rows;
}

/** One row per (post, day) for the last N days of a published post's life - matches BR-R07. */
function genPostMetrics(publishedPosts) {
  const rows = [];
  for (const post of publishedPosts) {
    const daysLive = Math.min(
      30,
      Math.max(
        1,
        Math.round(
          (Date.now() - post.published_at.getTime()) / (24 * 60 * 60 * 1000),
        ),
      ),
    );
    let reach = faker.number.int({ min: 50, max: 2000 });
    for (let d = 0; d < daysLive; d++) {
      reach += faker.number.int({ min: -20, max: 150 });
      reach = Math.max(reach, 0);
      const impressions = Math.round(
        reach * faker.number.float({ min: 1.1, max: 2.5 }),
      );
      rows.push({
        id: uuid(),
        post_id: post.id,
        metric_date: new Date(
          post.published_at.getTime() + d * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .slice(0, 10),
        reach,
        impressions,
        likes: faker.number.int({ min: 0, max: Math.round(reach * 0.08) }),
        comments: faker.number.int({ min: 0, max: Math.round(reach * 0.02) }),
        shares: faker.number.int({ min: 0, max: Math.round(reach * 0.01) }),
        created_at: new Date(
          post.published_at.getTime() + d * 24 * 60 * 60 * 1000,
        ),
      });
    }
  }
  return rows;
}

function genPlans() {
  const now = new Date();
  return [
    {
      id: uuid(),
      code: "free",
      name: "Free",
      stripe_price_id: null,
      monthly_price: 0,
      yearly_price: 0,
      post_limit: 10,
      scheduled_post_limit: 3,
      analytics_retention_days: 30,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuid(),
      code: "pro",
      name: "Pro",
      stripe_price_id: `price_${faker.string.alphanumeric(14)}`,
      monthly_price: 29,
      yearly_price: 290,
      post_limit: -1,
      scheduled_post_limit: 50,
      analytics_retention_days: 180,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuid(),
      code: "team",
      name: "Team",
      stripe_price_id: `price_${faker.string.alphanumeric(14)}`,
      monthly_price: 99,
      yearly_price: 990,
      post_limit: -1,
      scheduled_post_limit: -1,
      analytics_retention_days: 365,
      created_at: now,
      updated_at: now,
    },
  ];
}

const SUBSCRIPTION_STATUS_WEIGHTS = [
  { value: "trialing", weight: 2 },
  { value: "active", weight: 6 },
  { value: "grace_period", weight: 1 },
  { value: "cancelled", weight: 1 },
];

function genSubscriptions(workspaces, plans) {
  return workspaces.map((ws) => {
    const drawnStatus = pickWeighted(SUBSCRIPTION_STATUS_WEIGHTS);
    const plan = pickWeighted([
      { value: plans[0], weight: 5 }, // free
      { value: plans[1], weight: 3 }, // pro
      { value: plans[2], weight: 1 }, // team
    ]);
    // free plans have no billing relationship — they only ever 'trialing' or 'active',
    // never 'grace_period'/'cancelled'. Compute the final status once so the
    // grace_period_end column always agrees with it (BR-F07).
    const status =
      plan.code === "free" &&
      (drawnStatus === "grace_period" || drawnStatus === "cancelled")
        ? "active"
        : drawnStatus;
    const periodStart = faker.date.recent({ days: 25 });
    const periodEnd = new Date(
      periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    return {
      id: uuid(),
      workspace_id: ws.id,
      plan_id: plan.id,
      stripe_customer_id:
        plan.code === "free" ? null : `cus_${faker.string.alphanumeric(14)}`,
      stripe_subscription_id:
        plan.code === "free" ? null : `sub_${faker.string.alphanumeric(14)}`,
      status,
      current_period_start: plan.code === "free" ? null : periodStart,
      current_period_end: plan.code === "free" ? null : periodEnd,
      grace_period_end:
        status === "grace_period"
          ? daysFromNow(faker.number.int({ min: 1, max: 7 }))
          : null,
      created_at: ws.created_at,
      updated_at: new Date(),
    };
  });
}

function genBillingEvents(subscriptions) {
  const rows = [];
  for (const sub of subscriptions) {
    if (!sub.stripe_subscription_id) continue;
    const count = faker.number.int({ min: 1, max: 4 });
    for (let i = 0; i < count; i++) {
      const eventType = pick([
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ]);
      const occurredAt = faker.date.between({
        from: sub.created_at,
        to: new Date(),
      });
      rows.push({
        id: uuid(),
        stripe_event_id: `evt_${faker.string.alphanumeric(20)}`,
        event_type: eventType,
        event_payload: JSON.stringify({
          id: sub.stripe_subscription_id,
          type: eventType,
        }),
        occurred_at: occurredAt,
        subscription_id: sub.id,
        created_at: occurredAt,
      });
    }
  }
  return rows;
}

const NOTIFICATION_TYPES = [
  "post.published",
  "post.failed",
  "member.invited",
  "subscription.past_due",
];

function genNotificationsAndRecipients(posts, membersByWorkspace) {
  const notifications = [];
  const recipients = [];
  const relevantPosts = posts.filter(
    (p) => p.status === "published" || p.status === "failed",
  );
  const sample = faker.helpers.arrayElements(
    relevantPosts,
    Math.round(relevantPosts.length * 0.6),
  );

  for (const post of sample) {
    const type = post.status === "published" ? "post.published" : "post.failed";
    const notif = {
      id: uuid(),
      workspace_id: post.workspace_id,
      type,
      title:
        type === "post.published" ? "Post published" : "Post failed to publish",
      message:
        type === "post.published"
          ? "Your post went live on the connected Facebook Page."
          : `Publishing failed: ${post.last_error || "unknown error"}`,
      payload: JSON.stringify({ postId: post.id }),
      created_at: post.updated_at,
    };
    notifications.push(notif);

    const members = membersByWorkspace.get(post.workspace_id) || [];
    for (const userId of members) {
      const isRead = Math.random() < 0.55;
      recipients.push({
        id: uuid(),
        notification_id: notif.id,
        user_id: userId,
        read_status: isRead,
        read_at: isRead
          ? faker.date.between({ from: notif.created_at, to: new Date() })
          : null,
        created_at: notif.created_at,
      });
    }
  }
  return { notifications, recipients };
}

const EMAIL_TYPES = [
  "invitation",
  "publish_success",
  "publish_failed",
  "token_expiring",
  "payment_failed",
];
const EMAIL_PROVIDERS = ["Resend", "SES", "SendGrid"];

function genEmailDeliveryLogs(invitations, posts, users) {
  const rows = [];

  for (const inv of invitations) {
    const status = pickWeighted([
      { value: "sent", weight: 8 },
      { value: "failed", weight: 1 },
      { value: "pending", weight: 1 },
    ]);
    rows.push({
      id: uuid(),
      workspace_id: inv.workspace_id,
      user_id: null,
      email_type: "invitation",
      recipient_email: inv.email,
      template_name: "invitation-email",
      provider: pick(EMAIL_PROVIDERS),
      status,
      dedupe_key: `invitation:${inv.id}`,
      retry_count:
        status === "failed" ? faker.number.int({ min: 1, max: 3 }) : 0,
      related_entity_type: "invitation",
      related_entity_id: inv.id,
      sent_at: status === "sent" ? inv.created_at : null,
      created_at: inv.created_at,
    });
  }

  const samplePosts = faker.helpers.arrayElements(
    posts.filter((p) => p.status === "published" || p.status === "failed"),
    Math.round(posts.length * 0.3),
  );
  for (const post of samplePosts) {
    const emailType =
      post.status === "published" ? "publish_success" : "publish_failed";
    const user = pick(users);
    rows.push({
      id: uuid(),
      workspace_id: post.workspace_id,
      user_id: user.id,
      email_type: emailType,
      recipient_email: user.email,
      template_name: `${emailType}-email`,
      provider: pick(EMAIL_PROVIDERS),
      status: "sent",
      dedupe_key: `${emailType}:${post.id}`,
      retry_count: 0,
      related_entity_type: "post",
      related_entity_id: post.id,
      sent_at: post.updated_at,
      created_at: post.updated_at,
    });
  }

  return rows;
}

const ROUTING_KEYS = [
  ["PostPublished", "platform.events", "post.published"],
  ["PostFailed", "platform.events", "post.failed"],
  ["SubscriptionActivated", "platform.events", "subscription.activated"],
  ["SubscriptionPastDue", "platform.events", "subscription.past_due"],
  ["MetricsSynchronized", "platform.events", "analytics.metrics_synchronized"],
  ["WorkspaceMemberInvited", "platform.events", "member.invited"],
];

function genEventMessageLogsAndDlq(count) {
  const logs = [];
  const dlq = [];
  for (let i = 0; i < count; i++) {
    const [eventType, exchange, routingKey] = pick(ROUTING_KEYS);
    const status = pickWeighted([
      { value: "processed", weight: 90 },
      { value: "pending", weight: 5 },
      { value: "failed", weight: 3 },
      { value: "dlq", weight: 2 },
    ]);
    const createdAt = faker.date.recent({ days: 30 });
    const retryCount =
      status === "dlq"
        ? faker.number.int({ min: 5, max: 8 })
        : status === "failed"
          ? faker.number.int({ min: 1, max: 4 })
          : 0;
    const eventId = uuid();
    logs.push({
      event_id: eventId,
      event_type: eventType,
      exchange_name: exchange,
      routing_key: routingKey,
      processing_status: status,
      retry_count: retryCount,
      payload: JSON.stringify({ sample: true, eventType }),
      result: status === "processed" ? JSON.stringify({ ok: true }) : null,
      processed_at:
        status === "pending"
          ? null
          : faker.date.soon({ days: 1, refDate: createdAt }),
      created_at: createdAt,
    });

    if (status === "dlq") {
      dlq.push({
        id: uuid(),
        event_id: eventId,
        error_message: pick([
          "Consumer threw: connection to downstream service timed out",
          "Consumer threw: validation failed for payload",
          "Consumer threw: unique constraint violation on retry",
        ]),
        retry_count: retryCount,
        failed_at: faker.date.soon({ days: 1, refDate: createdAt }),
        reprocessed_at: maybe(
          0.3,
          faker.date.soon({ days: 3, refDate: createdAt }),
        ),
      });
    }
  }
  return { logs, dlq };
}

const AUDIT_ACTIONS = [
  ["workspace.created", "workspace"],
  ["facebook_account.connected", "facebook_account"],
  ["post.published", "post"],
  ["member.role_changed", "workspace_member"],
  ["member.removed", "workspace_member"],
];

function genAuditLogs(count, users, workspaces) {
  return Array.from({ length: count }, () => {
    const [action, entityType] = pick(AUDIT_ACTIONS);
    return {
      id: uuid(),
      workspace_id: maybe(0.95, pick(workspaces).id), // ~5% platform-wide (NULL)
      actor_user_id: maybe(0.9, pick(users).id),
      action,
      entity_type: entityType,
      entity_id: maybe(0.8, uuid()),
      old_values: maybe(0.3, JSON.stringify({ status: "before" })),
      new_values: maybe(0.3, JSON.stringify({ status: "after" })),
      metadata: JSON.stringify({ source: "seed-script" }),
      created_at: faker.date.recent({ days: 60 }),
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(
    `Seeding: ${USER_COUNT} users, ${WORKSPACE_COUNT} workspaces, ${POST_COUNT} posts...`,
  );
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const users = genUsers(USER_COUNT);
    const workspaces = genWorkspaces(WORKSPACE_COUNT, users);

    const ownerByWorkspace = new Map(
      workspaces.map((w) => [w.id, w.owner_user_id]),
    );
    const workspaceMembers = genWorkspaceMembers(workspaces, users);

    const membersByWorkspace = new Map();
    for (const m of workspaceMembers) {
      if (!membersByWorkspace.has(m.workspace_id))
        membersByWorkspace.set(m.workspace_id, []);
      membersByWorkspace.get(m.workspace_id).push(m.user_id);
    }

    const invitations = genInvitations(workspaces, ownerByWorkspace);
    const facebookAccounts = genFacebookAccounts(workspaces);

    const accountsByWorkspace = new Map();
    for (const acc of facebookAccounts) {
      if (!accountsByWorkspace.has(acc.workspace_id))
        accountsByWorkspace.set(acc.workspace_id, []);
      accountsByWorkspace.get(acc.workspace_id).push(acc);
    }

    const posts = genPosts(
      POST_COUNT,
      workspaces,
      accountsByWorkspace,
      membersByWorkspace,
    );
    const publishedPosts = posts.filter((p) => p.status === "published");
    const postMetrics = genPostMetrics(publishedPosts);

    const plans = genPlans();
    const subscriptions = genSubscriptions(workspaces, plans);
    const billingEvents = genBillingEvents(subscriptions);

    const { notifications, recipients } = genNotificationsAndRecipients(
      posts,
      membersByWorkspace,
    );
    const emailDeliveryLogs = genEmailDeliveryLogs(invitations, posts, users);
    const { logs: eventMessageLogs, dlq: deadLetterMessages } =
      genEventMessageLogsAndDlq(Math.round(POST_COUNT * 1.5));
    const auditLogs = genAuditLogs(
      Math.round(POST_COUNT * 0.4),
      users,
      workspaces,
    );

    // ---- insert in dependency order ---------------------------------------
    await insertRows(
      client,
      "core.users",
      [
        "id",
        "clerk_user_id",
        "email",
        "full_name",
        "avatar_url",
        "status",
        "created_at",
      ],
      users,
    );
    await insertRows(
      client,
      "core.workspaces",
      [
        "id",
        "name",
        "slug",
        "description",
        "status",
        "owner_user_id",
        "created_at",
      ],
      workspaces,
    );
    await insertRows(
      client,
      "core.workspace_members",
      [
        "id",
        "workspace_id",
        "user_id",
        "role",
        "invited_at",
        "accepted_at",
        "joined_at",
      ],
      workspaceMembers,
    );
    await insertRows(
      client,
      "core.invitations",
      [
        "id",
        "workspace_id",
        "email",
        "role",
        "token",
        "status",
        "invited_by_user_id",
        "expires_at",
        "created_at",
      ],
      invitations,
    );
    await insertRows(
      client,
      "core.facebook_accounts",
      [
        "id",
        "workspace_id",
        "page_id",
        "page_name",
        "access_token",
        "token_expires_at",
        "connected_at",
        "updated_at",
      ],
      facebookAccounts,
    );
    await insertRows(
      client,
      "core.posts",
      [
        "id",
        "workspace_id",
        "facebook_account_id",
        "created_by_user_id",
        "title",
        "content",
        "media_url",
        "status",
        "facebook_graph_post_id",
        "scheduled_at",
        "published_at",
        "last_error",
        "created_at",
        "updated_at",
      ],
      posts,
    );
    await insertRows(
      client,
      "core.audit_logs",
      [
        "id",
        "workspace_id",
        "actor_user_id",
        "action",
        "entity_type",
        "entity_id",
        "old_values",
        "new_values",
        "metadata",
        "created_at",
      ],
      auditLogs,
    );

    await insertRows(
      client,
      "billing.plans",
      [
        "id",
        "code",
        "name",
        "stripe_price_id",
        "monthly_price",
        "yearly_price",
        "post_limit",
        "scheduled_post_limit",
        "analytics_retention_days",
        "created_at",
        "updated_at",
      ],
      plans,
    );
    await insertRows(
      client,
      "billing.subscriptions",
      [
        "id",
        "workspace_id",
        "plan_id",
        "stripe_customer_id",
        "stripe_subscription_id",
        "status",
        "current_period_start",
        "current_period_end",
        "grace_period_end",
        "created_at",
        "updated_at",
      ],
      subscriptions,
    );
    await insertRows(
      client,
      "billing.billing_events",
      [
        "id",
        "stripe_event_id",
        "event_type",
        "event_payload",
        "occurred_at",
        "subscription_id",
        "created_at",
      ],
      billingEvents,
    );

    await insertRows(
      client,
      "analytics.post_metrics",
      [
        "id",
        "post_id",
        "metric_date",
        "reach",
        "impressions",
        "likes",
        "comments",
        "shares",
        "created_at",
      ],
      postMetrics,
    );

    await insertRows(
      client,
      "notification.notifications",
      [
        "id",
        "workspace_id",
        "type",
        "title",
        "message",
        "payload",
        "created_at",
      ],
      notifications,
    );
    await insertRows(
      client,
      "notification.notification_recipients",
      [
        "id",
        "notification_id",
        "user_id",
        "read_status",
        "read_at",
        "created_at",
      ],
      recipients,
    );

    await insertRows(
      client,
      "email.email_delivery_logs",
      [
        "id",
        "workspace_id",
        "user_id",
        "email_type",
        "recipient_email",
        "template_name",
        "provider",
        "status",
        "dedupe_key",
        "retry_count",
        "related_entity_type",
        "related_entity_id",
        "sent_at",
        "created_at",
      ],
      emailDeliveryLogs,
    );

    await insertRows(
      client,
      "messaging.event_message_logs",
      [
        "event_id",
        "event_type",
        "exchange_name",
        "routing_key",
        "processing_status",
        "retry_count",
        "payload",
        "result",
        "processed_at",
        "created_at",
      ],
      eventMessageLogs,
    );
    await insertRows(
      client,
      "messaging.dead_letter_messages",
      [
        "id",
        "event_id",
        "error_message",
        "retry_count",
        "failed_at",
        "reprocessed_at",
      ],
      deadLetterMessages,
    );

    await client.query("COMMIT");

    console.log("Seed complete:");
    console.log(`  core.users                         ${users.length}`);
    console.log(`  core.workspaces                     ${workspaces.length}`);
    console.log(
      `  core.workspace_members               ${workspaceMembers.length}`,
    );
    console.log(`  core.invitations                     ${invitations.length}`);
    console.log(
      `  core.facebook_accounts               ${facebookAccounts.length}`,
    );
    console.log(
      `  core.posts                           ${posts.length}  <-- main table`,
    );
    console.log(`  core.audit_logs                      ${auditLogs.length}`);
    console.log(`  billing.plans                        ${plans.length}`);
    console.log(
      `  billing.subscriptions                ${subscriptions.length}`,
    );
    console.log(
      `  billing.billing_events                ${billingEvents.length}`,
    );
    console.log(
      `  analytics.post_metrics                ${postMetrics.length}`,
    );
    console.log(
      `  notification.notifications            ${notifications.length}`,
    );
    console.log(`  notification.notification_recipients  ${recipients.length}`);
    console.log(
      `  email.email_delivery_logs             ${emailDeliveryLogs.length}`,
    );
    console.log(
      `  messaging.event_message_logs          ${eventMessageLogs.length}`,
    );
    console.log(
      `  messaging.dead_letter_messages        ${deadLetterMessages.length}`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed, rolled back:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
