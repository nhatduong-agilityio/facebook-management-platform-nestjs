import { Migration } from '@mikro-orm/migrations';

/**
 * Adds `deleted_at` to `core.facebook_accounts` to support soft-delete on Page deauthorization (T2.7).
 *
 * `FacebookAccount` was intentionally built without `deleted_at` (T2.2, no BaseEntity),
 * but T2.7 requires soft-deleting a page connection when Facebook sends a deauthorize webhook.
 * Queries must filter `deleted_at IS NULL` explicitly — no global ORM filter is applied.
 */
export class Migration20260703000000_FacebookAccountSoftDelete extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "core"."facebook_accounts"
        ADD COLUMN "deleted_at" timestamptz NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "core"."facebook_accounts"
        DROP COLUMN "deleted_at";
    `);
  }
}
