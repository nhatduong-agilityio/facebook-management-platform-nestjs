import { Entity, Property } from '@mikro-orm/decorators/legacy';
import { PrimaryKeyProp } from '@mikro-orm/core';

/**
 * CQRS read-model for workspace membership (ADR-052).
 *
 * Built by consuming workspace membership events; used at notification-dispatch time
 * so the Notification Service never calls `apps/api` for every event (ADR-051).
 *
 * Cold-start reconciliation (ADR-059) re-upserts rows from
 * `GET /internal/workspaces/:id/members` on service boot.
 *
 * Composite PK `(workspace_id, user_id)` — no UUID surrogate key.
 * Does **not** extend `BaseEntity`.
 */
@Entity({ tableName: 'workspace_members_projection', schema: 'notification' })
export class WorkspaceMemberProjection {
  /** Composite PK discriminator — used by MikroORM for identity-map keying. */
  [PrimaryKeyProp]?: ['workspaceId', 'userId'];

  /** UUID of the workspace (part of composite PK). */
  @Property({ columnType: 'uuid', primary: true })
  workspaceId!: string;

  /** UUID of the member user (part of composite PK). */
  @Property({ columnType: 'uuid', primary: true })
  userId!: string;

  /** Role of this member in the workspace. */
  @Property({ length: 20 })
  role!: string;

  /** Last time this row was synced (from event or reconciliation). */
  @Property({ columnType: 'timestamptz' })
  syncedAt!: Date;
}
