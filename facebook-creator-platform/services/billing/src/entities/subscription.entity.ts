import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { ref, type Ref } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import { Plan } from './plan.entity';

/** Valid lifecycle states for a subscription (BR-F05, ADR-017, T3.6). */
export type SubscriptionStatus = 'trialing' | 'active' | 'grace_period' | 'past_due' | 'cancelled';

/**
 * A workspace's billing subscription.
 *
 * Stored in `billing.subscriptions`. One per workspace (BR-R03, UNIQUE on workspace_id).
 * `workspaceId` is a cross-schema logical FK to `core.workspaces.id` (BR-R06 —
 * no DB FK constraint, but indexed for lookups per BR-R08).
 * `plan` is a same-schema real FK to `billing.plans.id`.
 *
 * Lifecycle is managed by the T3.2 state machine; no `deleted_at` — use `status`.
 */
@Entity({ tableName: 'subscriptions', schema: 'billing' })
@Unique({ properties: ['workspaceId'] })
export class Subscription {
  /** Application-generated UUID v7 primary key (ADR-013). No DB DEFAULT. */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * Owning workspace. Cross-schema logical FK to `core.workspaces.id` (BR-R06).
   * Indexed for lookups (BR-R08). Uniqueness enforced by UNIQUE constraint above.
   */
  @Property({ type: 'uuid' })
  @Index()
  workspaceId!: string;

  /** The plan this subscription is on. Same-schema real FK to `billing.plans.id`. */
  @ManyToOne({ entity: () => Plan, index: true })
  plan!: Ref<Plan>;

  /**
   * Stripe Customer ID. Null until the first checkout is completed.
   * Must not appear in logs (billing identity).
   */
  @Property({ length: 255, nullable: true })
  stripeCustomerId?: string;

  /**
   * Stripe Subscription ID. Null until activated via Stripe.
   * Unique when set (UNIQUE constraint on the table).
   */
  @Property({ length: 255, nullable: true })
  stripeSubscriptionId?: string;

  /** Current subscription state (BR-F05). Driven by T3.2 state machine. */
  @Property({ length: 15 })
  status: SubscriptionStatus = 'trialing';

  /** Start of the current billing period. Null until first Stripe confirmation. */
  @Property({ type: 'timestamptz', nullable: true })
  currentPeriodStart?: Date;

  /** End of the current billing period. Null until first Stripe confirmation. */
  @Property({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date;

  /**
   * End of grace period. Non-null iff `status = 'grace_period'` (BR-F07).
   * Managed by T3.2 state machine.
   */
  @Property({ type: 'timestamptz', nullable: true })
  gracePeriodEnd?: Date;

  /** Row creation timestamp. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  /** Last-modified timestamp. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  /**
   * Creates a new trialing subscription for a workspace.
   *
   * @param workspaceId - UUID of the owning workspace (cross-schema logical FK).
   * @param plan        - The plan to subscribe to.
   * @returns A new `Subscription` in `trialing` status with no Stripe IDs.
   */
  static create(workspaceId: string, plan: Plan): Subscription {
    const sub = new Subscription();
    sub.workspaceId = workspaceId;
    sub.plan = ref(plan);
    sub.status = 'trialing';
    return sub;
  }
}
