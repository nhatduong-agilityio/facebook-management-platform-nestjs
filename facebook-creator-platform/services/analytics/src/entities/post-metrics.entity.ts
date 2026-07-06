import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { uuidv7 } from 'uuidv7';

/**
 * A single day's engagement metrics for a Facebook post.
 *
 * Stored in `analytics.post_metrics` (owned by `services/analytics`).
 *
 * `postId` and `workspaceId` are cross-schema logical FKs (plain UUID columns,
 * no DB constraint — BR-R06, ADR-046). Both have btree indexes (BR-R08).
 *
 * Idempotent upsert key: `UNIQUE (post_id, metric_date)` — re-delivering
 * `PostPublishedEvent` for the same post on the same calendar day produces
 * exactly one row (via `em.upsert`).
 *
 * Does NOT extend `BaseEntity` — this service has no shared `BaseEntity`
 * class and the DDL does not include `updated_at` / `deleted_at`.
 */
@Entity({ tableName: 'post_metrics', schema: 'analytics' })
@Unique({ properties: ['postId', 'metricDate'] })
export class PostMetrics {
  /** Application-generated UUID v7 primary key (ADR-013). No DB DEFAULT. */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * UUID of the post in `core.posts` (cross-schema logical FK, ADR-046).
   * Indexed for per-post metric lookups (BR-R08).
   */
  @Index()
  @Property({ type: 'uuid', fieldName: 'post_id' })
  postId!: string;

  /**
   * UUID of the workspace in `core.workspaces` (cross-schema logical FK, ADR-046).
   * Indexed for workspace-level metric aggregation (BR-R08).
   */
  @Index()
  @Property({ type: 'uuid', fieldName: 'workspace_id' })
  workspaceId!: string;

  /**
   * The calendar date these metrics belong to.
   * Together with `postId` forms the UNIQUE key that drives idempotent upsert.
   */
  @Property({ type: 'date', fieldName: 'metric_date' })
  metricDate!: Date;

  /** Total unique accounts reached (post_impressions_unique). */
  @Property({ default: 0 })
  reach: number = 0;

  /** Total impressions (post_impressions). */
  @Property({ default: 0 })
  impressions: number = 0;

  /** Total post likes/reactions. */
  @Property({ default: 0 })
  likes: number = 0;

  /** Total post comments. */
  @Property({ default: 0 })
  comments: number = 0;

  /** Total post shares. */
  @Property({ default: 0 })
  shares: number = 0;

  /** When this row was created or last refreshed from the Graph API. */
  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
