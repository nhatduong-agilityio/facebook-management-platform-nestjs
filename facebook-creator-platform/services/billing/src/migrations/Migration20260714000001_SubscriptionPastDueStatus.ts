import { Migration } from '@mikro-orm/migrations';

/**
 * Adds `'past_due'` to the `chk_subscriptions_status` CHECK constraint.
 *
 * T3.6 (ADR-060) extended `SubscriptionStatus` with `'past_due'` to handle
 * `customer.subscription.updated → past_due` Stripe webhooks. The TypeScript
 * entity type was updated but the DB CHECK constraint was not. This migration
 * corrects that omission.
 *
 * PostgreSQL does not support ALTER CONSTRAINT — we drop and recreate it.
 * The operation runs in a transaction; the table is not locked for reads.
 */
export class Migration20260714000001_SubscriptionPastDueStatus extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE billing.subscriptions
        DROP CONSTRAINT chk_subscriptions_status;
    `);

    this.addSql(`
      ALTER TABLE billing.subscriptions
        ADD CONSTRAINT chk_subscriptions_status
        CHECK (status IN ('trialing', 'active', 'grace_period', 'past_due', 'cancelled'));
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE billing.subscriptions
        DROP CONSTRAINT chk_subscriptions_status;
    `);

    this.addSql(`
      ALTER TABLE billing.subscriptions
        ADD CONSTRAINT chk_subscriptions_status
        CHECK (status IN ('trialing', 'active', 'grace_period', 'cancelled'));
    `);
  }
}
