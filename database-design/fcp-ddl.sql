CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USERS
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,

    full_name VARCHAR(255),
    avatar_url VARCHAR(2048),

    status VARCHAR(50) NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- WORKSPACES
-- =====================================================

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,

    status VARCHAR(50) NOT NULL DEFAULT 'active',

    owner_user_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_workspace_owner
        FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
);

-- =====================================================
-- WORKSPACE MEMBERS
-- =====================================================

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,

    role VARCHAR(20) NOT NULL,

    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_member_role
        CHECK (role IN ('owner','editor','viewer')),

    CONSTRAINT uq_workspace_member
        UNIQUE(workspace_id, user_id),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);

-- =====================================================
-- INVITATIONS
-- =====================================================

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    email VARCHAR(255) NOT NULL,

    role VARCHAR(20) NOT NULL,

    token VARCHAR(255) NOT NULL UNIQUE,

    invited_by_user_id UUID NOT NULL,

    status VARCHAR(30) NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        role IN ('editor','viewer')
    ),

    CHECK (
        status IN (
            'pending',
            'accepted',
            'expired',
            'revoked'
        )
    ),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (invited_by_user_id)
        REFERENCES users(id)
);

-- =====================================================
-- FACEBOOK ACCOUNTS
-- =====================================================

CREATE TABLE facebook_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    connected_by_user_id UUID NOT NULL,

    facebook_page_id VARCHAR(255) NOT NULL UNIQUE,

    facebook_page_name VARCHAR(255) NOT NULL,

    page_access_token TEXT NOT NULL,

    token_expires_at TIMESTAMPTZ,

    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (connected_by_user_id)
        REFERENCES users(id)
);

-- =====================================================
-- POSTS
-- =====================================================

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    created_by_user_id UUID NOT NULL,

    facebook_account_id UUID,

    title VARCHAR(255),

    content TEXT NOT NULL,

    media_url VARCHAR(2048),

    status VARCHAR(30) NOT NULL,

    facebook_post_id VARCHAR(255),

    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,

    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        status IN (
            'draft',
            'scheduled',
            'published',
            'failed'
        )
    ),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(id),

    FOREIGN KEY (facebook_account_id)
        REFERENCES facebook_accounts(id)
);

-- =====================================================
-- POST METRICS
-- =====================================================

CREATE TABLE post_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    post_id UUID NOT NULL,

    metric_date DATE NOT NULL,

    reach INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,

    fetched_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(post_id, metric_date),

    FOREIGN KEY (post_id)
        REFERENCES posts(id)
);

-- =====================================================
-- PLANS
-- =====================================================

CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code VARCHAR(20) NOT NULL UNIQUE,

    name VARCHAR(100) NOT NULL,

    stripe_price_id VARCHAR(255),

    monthly_price NUMERIC(10,2),
    yearly_price NUMERIC(10,2),

    post_limit INTEGER NOT NULL,
    scheduled_post_limit INTEGER NOT NULL,

    analytics_retention_days INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SUBSCRIPTIONS
-- =====================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL UNIQUE,

    plan_id UUID NOT NULL,

    stripe_customer_id VARCHAR(255),

    stripe_subscription_id VARCHAR(255) UNIQUE,

    status VARCHAR(30) NOT NULL,

    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,

    grace_period_end TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        status IN (
            'trialing',
            'active',
            'grace_period',
            'cancelled'
        )
    ),

    FOREIGN KEY (plan_id)
        REFERENCES plans(id)
);

-- =====================================================
-- BILLING EVENTS
-- =====================================================

CREATE TABLE billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    subscription_id UUID NOT NULL,

    stripe_event_id VARCHAR(255) NOT NULL UNIQUE,

    event_type VARCHAR(100) NOT NULL,

    event_payload JSONB NOT NULL,

    occurred_at TIMESTAMPTZ NOT NULL,

    FOREIGN KEY (subscription_id)
        REFERENCES subscriptions(id)
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    type VARCHAR(100) NOT NULL,

    title VARCHAR(255) NOT NULL,

    message TEXT,

    payload JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    notification_id UUID NOT NULL,

    user_id UUID NOT NULL,

    read_status BOOLEAN NOT NULL DEFAULT FALSE,

    read_at TIMESTAMPTZ,

    UNIQUE(notification_id, user_id),

    FOREIGN KEY (notification_id)
        REFERENCES notifications(id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);

-- =====================================================
-- EMAIL LOGS
-- =====================================================

CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email_type VARCHAR(100) NOT NULL,

    recipient_email VARCHAR(255) NOT NULL,

    template_name VARCHAR(255) NOT NULL,

    provider VARCHAR(50) NOT NULL,

    status VARCHAR(50) NOT NULL,

    dedupe_key VARCHAR(255) UNIQUE,

    retry_count INTEGER NOT NULL DEFAULT 0,

    sent_at TIMESTAMPTZ,

    workspace_id UUID,
    user_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);

-- =====================================================
-- AUDIT LOGS
-- =====================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    actor_user_id UUID NOT NULL,

    action VARCHAR(150) NOT NULL,

    entity_type VARCHAR(150) NOT NULL,

    entity_id UUID,

    old_values JSONB,
    new_values JSONB,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (actor_user_id)
        REFERENCES users(id)
);

-- =====================================================
-- EVENT MESSAGE LOGS (RABBITMQ)
-- =====================================================

CREATE TABLE event_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL,

    event_type VARCHAR(100) NOT NULL,

    exchange_name VARCHAR(100) NOT NULL,

    routing_key VARCHAR(100) NOT NULL,

    processing_status VARCHAR(50) NOT NULL,

    retry_count INTEGER NOT NULL DEFAULT 0,

    payload JSONB,

    result JSONB,

    processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- DEAD LETTER MESSAGES
-- =====================================================

CREATE TABLE dead_letter_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL,

    error_message TEXT NOT NULL,

    retry_count INTEGER NOT NULL,

    failed_at TIMESTAMPTZ NOT NULL,

    reprocessed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
