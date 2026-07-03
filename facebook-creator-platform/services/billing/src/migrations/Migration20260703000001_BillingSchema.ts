import { Migration } from '@mikro-orm/migrations';

/**
 * Creates the `billing` schema with `billing.plans` and `billing.subscriptions` tables,
 * then seeds the three canonical plan rows (free / pro / team).
 *
 * Seed UUIDs are fixed v7 values generated offline — stable across all environments.
 * The INSERT uses ON CONFLICT DO NOTHING so running the migration twice is idempotent.
 *
 * Note: `billing.billing_events` is created in T3.2 (billing state machine + Stripe webhook).
 */
export class Migration20260703000001_BillingSchema extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE SCHEMA IF NOT EXISTS billing;`);

    this.addSql(`
      CREATE TABLE billing.plans (
        id                        UUID          PRIMARY KEY,
        code                      VARCHAR(20)   NOT NULL,
        name                      VARCHAR(50)   NOT NULL,
        stripe_price_id           VARCHAR(255),
        monthly_price             DECIMAL(10,2) NOT NULL DEFAULT 0,
        yearly_price              DECIMAL(10,2) NOT NULL DEFAULT 0,
        post_limit                INTEGER       NOT NULL DEFAULT 10,
        scheduled_post_limit      INTEGER       NOT NULL DEFAULT 3,
        analytics_retention_days  INTEGER       NOT NULL DEFAULT 30,
        created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT uq_plans_code      UNIQUE (code),
        CONSTRAINT chk_plans_code     CHECK (code IN ('free', 'pro', 'team')),
        CONSTRAINT chk_plans_prices   CHECK (monthly_price >= 0 AND yearly_price >= 0),
        CONSTRAINT chk_plans_retention CHECK (analytics_retention_days > 0)
      );
    `);

    this.addSql(`
      CREATE TABLE billing.subscriptions (
        id                       UUID         PRIMARY KEY,
        workspace_id             UUID         NOT NULL,
        plan_id                  UUID         NOT NULL REFERENCES billing.plans (id) ON DELETE RESTRICT,
        stripe_customer_id       VARCHAR(255),
        stripe_subscription_id   VARCHAR(255),
        status                   VARCHAR(15)  NOT NULL DEFAULT 'trialing',
        current_period_start     TIMESTAMPTZ,
        current_period_end       TIMESTAMPTZ,
        grace_period_end         TIMESTAMPTZ,
        created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT uq_subscriptions_workspace_id            UNIQUE (workspace_id),
        CONSTRAINT uq_subscriptions_stripe_subscription_id  UNIQUE (stripe_subscription_id),
        CONSTRAINT chk_subscriptions_status      CHECK (status IN ('trialing', 'active', 'grace_period', 'cancelled')),
        CONSTRAINT chk_subscriptions_grace_period CHECK ((status = 'grace_period') = (grace_period_end IS NOT NULL))
      );
    `);

    this.addSql(`CREATE INDEX idx_subscriptions_workspace_id ON billing.subscriptions (workspace_id);`);
    this.addSql(`CREATE INDEX idx_subscriptions_plan_id ON billing.subscriptions (plan_id);`);
    this.addSql(`CREATE INDEX idx_subscriptions_status ON billing.subscriptions (status);`);

    // Seed the three canonical plans with fixed UUIDs (ON CONFLICT DO NOTHING — idempotent)
    this.addSql(`
      INSERT INTO billing.plans
        (id, code, name, stripe_price_id, monthly_price, yearly_price, post_limit, scheduled_post_limit, analytics_retention_days)
      VALUES
        ('01975700-0000-7000-8000-000000000001', 'free', 'Free',  NULL,         0,     0,   10,  3,  30),
        ('01975700-0000-7000-8000-000000000002', 'pro',  'Pro',   'price_pro',  29.00, 290, 100, 20, 365),
        ('01975700-0000-7000-8000-000000000003', 'team', 'Team',  'price_team', 79.00, 790, 500, 50, 730)
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS billing.subscriptions;`);
    this.addSql(`DROP TABLE IF EXISTS billing.plans;`);
    this.addSql(`DROP SCHEMA IF EXISTS billing;`);
  }
}
