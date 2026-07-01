import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { ref, type Ref } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import type { WorkspaceRole } from '../../identity/types/workspace-role.type';
import { Workspace } from './workspace.entity';

/**
 * Membership record linking a user to a workspace with a specific role.
 *
 * Stored in `core.workspace_members`. Does not extend `BaseEntity` because the DDL
 * does not include a `deletedAt` column — membership records are hard-deleted on removal.
 * `joinedAt` serves as the creation timestamp.
 *
 * BR-R01: `(workspaceId, userId)` is unique — one role per user per workspace.
 *
 * Relationships:
 * - `workspace` (`@ManyToOne`) — the owning workspace (same module, same schema).
 * - `userId` — scalar UUID for the member user (cross-module logical FK, BR-R06).
 */
@Entity({ tableName: 'workspace_members', schema: 'core' })
@Unique({ properties: ['workspace', 'userId'] })
export class WorkspaceMember {
  /** Application-generated UUID v7 primary key (ADR-013). */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * Owning workspace. Managed as a `@ManyToOne` relation (same module, same schema).
   * The underlying column is `workspace_id` (btree-indexed, BR-R08).
   */
  @ManyToOne({ entity: () => Workspace, index: true })
  workspace!: Ref<Workspace>;

  /**
   * UUID of the member user. Logical FK to `core.users.id` (cross-module — BR-R06).
   * Indexed for per-user workspace lookups (BR-R08).
   */
  @Property({ type: 'uuid' })
  @Index()
  userId!: string;

  /** RBAC role within the workspace. Defaults to `viewer` for invited members. */
  @Property({ length: 20 })
  role!: WorkspaceRole;

  /** Timestamp when the invitation was sent. Null for the owner (no invite flow). */
  @Property({ type: 'timestamptz', nullable: true })
  invitedAt?: Date;

  /** Timestamp when the invited user accepted the invitation. */
  @Property({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  /** Timestamp when the user joined the workspace. Set on creation. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  joinedAt: Date = new Date();

  // ---------------------------------------------------------------------------
  // Factory helpers — keep `ref()` out of service code (services may not import
  // @mikro-orm/core per §14).
  // ---------------------------------------------------------------------------

  /**
   * Creates the owner membership seeded when a new workspace is created.
   *
   * @param workspace - The newly created `Workspace` entity.
   * @param userId    - UUID of the owning user.
   */
  static forOwner(workspace: Workspace, userId: string): WorkspaceMember {
    const m = new WorkspaceMember();
    m.workspace = ref(workspace);
    m.userId = userId;
    m.role = 'owner';
    return m;
  }

  /**
   * Creates a non-owner membership after an invitation is accepted.
   *
   * @param workspace - The target `Workspace` entity.
   * @param userId    - UUID of the user accepting the invite.
   * @param role      - Role granted (`editor` or `viewer`).
   */
  static forAcceptedInvite(
    workspace: Workspace,
    userId: string,
    role: 'editor' | 'viewer',
  ): WorkspaceMember {
    const m = new WorkspaceMember();
    m.workspace = ref(workspace);
    m.userId = userId;
    m.role = role;
    m.acceptedAt = new Date();
    return m;
  }
}
