import { Collection, type Opt } from '@mikro-orm/core';
import { Entity, Index, OneToMany, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { Invitation } from './invitation.entity';

/**
 * Lifecycle state of a workspace.
 * - `active`    — normal operation; all features available.
 * - `suspended` — access restricted by an admin action.
 */
export type WorkspaceStatus = 'active' | 'suspended';

/**
 * A creator workspace that groups Facebook pages, posts, and team members.
 *
 * Stored in `core.workspaces`. The `ownerUserId` references `core.users.id` via a
 * logical FK (cross-module — BR-R06). The real ownership constraint is enforced via
 * `workspace_members.role = 'owner'` membership (BR-F09).
 *
 * Relationships (same module, same schema):
 * - `members`     (`@OneToMany`) — active membership records.
 * - `invitations` (`@OneToMany`) — outstanding and historical invitations.
 *
 * Soft-deleted via `deletedAt` from `BaseEntity`; hidden from all queries by default.
 */
@Entity({ tableName: 'workspaces', schema: 'core' })
export class Workspace extends BaseEntity {
  /** Display name of the workspace. 2–100 characters (BR-F01). */
  @Property({ length: 100 })
  name!: string;

  /** URL-safe slug derived from `name`. Unique across all workspaces. */
  @Property({ length: 120 })
  @Unique()
  slug!: string;

  /** Optional longer description of the workspace. Max 500 characters. */
  @Property({ length: 500, nullable: true })
  description?: string;

  /** Current lifecycle state. Defaults to `active` on creation. */
  @Property({ length: 15, default: 'active' })
  status: WorkspaceStatus & Opt = 'active';

  /**
   * UUID of the `core.users` record that owns this workspace.
   * Logical FK — cross-module (BR-R06). Indexed for owner-list queries (BR-R08).
   */
  @Property({ type: 'uuid' })
  @Index()
  ownerUserId!: string;

  /**
   * All membership records for this workspace.
   * Not populated by default — use `populate: ['members']` when needed.
   */
  @OneToMany({ entity: () => WorkspaceMember, mappedBy: 'workspace' })
  members = new Collection<WorkspaceMember>(this);

  /**
   * All invitation records issued for this workspace.
   * Not populated by default — use `populate: ['invitations']` when needed.
   */
  @OneToMany({ entity: () => Invitation, mappedBy: 'workspace' })
  invitations = new Collection<Invitation>(this);
}
