import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { uuidv7 } from 'uuidv7';
import type { WorkspaceRole } from '../../identity/types/workspace-role.type';

/**
 * Membership record linking a user to a workspace with a specific role.
 *
 * Stored in `core.workspace_members`. Does not extend `BaseEntity` because the DDL
 * does not include a `deletedAt` column — membership records are hard-deleted when a
 * member is removed. `joinedAt` serves as the creation timestamp.
 *
 * BR-R01: `(workspaceId, userId)` is unique — a user can hold only one role per workspace.
 */
@Entity({ tableName: 'workspace_members', schema: 'core' })
@Unique({ properties: ['workspaceId', 'userId'] })
export class WorkspaceMember {
  /** Application-generated UUID v7 primary key (ADR-013). */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * UUID of the parent workspace. Logical FK to `core.workspaces.id` (BR-R06).
   * Indexed for per-workspace member lookups (BR-R08).
   */
  @Property({ type: 'uuid' })
  @Index()
  workspaceId!: string;

  /**
   * UUID of the member user. Logical FK to `core.users.id` (BR-R06).
   * Indexed for per-user workspace lookups (BR-R08).
   */
  @Property({ type: 'uuid' })
  @Index()
  userId!: string;

  /** RBAC role within the workspace. Defaults to `viewer` for invited members. */
  @Property({ length: 20, default: 'viewer' })
  role!: WorkspaceRole;

  /** Timestamp when the invitation was sent. Null for owner (no invite flow). */
  @Property({ type: 'timestamptz', nullable: true })
  invitedAt?: Date;

  /** Timestamp when the invited user accepted their invitation. */
  @Property({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  /** Timestamp when the user joined the workspace. Set on creation. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  joinedAt: Date = new Date();
}
