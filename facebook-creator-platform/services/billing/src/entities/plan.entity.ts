import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { uuidv7 } from 'uuidv7';

/**
 * A billing plan (free / pro / team). Static reference data seeded at migration time.
 *
 * Stored in `billing.plans`. No `deleted_at` — plans are never soft-deleted.
 * `id` is application-generated (uuid v7, ADR-013). No DB DEFAULT on this column.
 */
@Entity({ tableName: 'plans', schema: 'billing' })
@Unique({ properties: ['code'] })
export class Plan {
  /** Application-generated UUID v7 primary key (ADR-013). No DB DEFAULT. */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * Short code used throughout the platform to identify the plan tier.
   * Constrained to `free | pro | team` by a DB CHECK constraint.
   */
  @Property({ length: 20 })
  code!: string;

  /** Human-readable plan name. */
  @Property({ length: 50 })
  name!: string;

  /**
   * Stripe Price ID (e.g. `price_xxx`).
   * Null for the free plan — free workspaces never go through Stripe checkout.
   */
  @Property({ length: 255, nullable: true })
  stripePriceId?: string;

  /** Monthly price in USD (0 for free). Stored as DECIMAL(10,2). */
  @Property({ type: 'decimal', precision: 10, scale: 2 })
  monthlyPrice!: string;

  /** Annual price in USD (0 for free). Stored as DECIMAL(10,2). */
  @Property({ type: 'decimal', precision: 10, scale: 2 })
  yearlyPrice!: string;

  /** Maximum total non-deleted posts allowed per workspace on this plan. */
  @Property()
  postLimit!: number;

  /** Maximum concurrently scheduled posts allowed on this plan. */
  @Property()
  scheduledPostLimit!: number;

  /** Number of days of analytics history available on this plan. */
  @Property()
  analyticsRetentionDays!: number;

  /** Row creation timestamp. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  /** Last-modified timestamp. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
