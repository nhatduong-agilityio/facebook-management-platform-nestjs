import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { ref, type Ref } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import { Workspace } from './workspace.entity';

/**
 * Lifecycle status of a workspace invitation.
 * - `pending`  — issued, not yet acted upon.
 * - `accepted` — invitee signed up / joined the workspace.
 * - `expired`  — `expiresAt` passed without acceptance.
 * - `revoked`  — cancelled by an owner/editor before acceptance.
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Workspace invitation record.
 *
 * Stored in `core.invitations`. Does not extend `BaseEntity` — the DDL has no
 * `deletedAt` or `updatedAt` columns; invitations are immutable after creation
 * (status transitions are the only mutation).
 *
 * Relationship:
 * - `workspace` (`@ManyToOne`) — the workspace the invite is for (same module).
 * - `invitedByUserId` — scalar UUID (cross-module logical FK to `core.users`, BR-R06).
 *
 * BR-F03b: `role` is never `owner` — enforced by DTO validation + DB CHECK.
 */
@Entity({ tableName: 'invitations', schema: 'core' })
export class Invitation {
  /** Application-generated UUID v7 primary key (ADR-013). */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * Target workspace. Managed as a `@ManyToOne` relation (same module, same schema).
   * The underlying column is `workspace_id` (indexed, BR-R08).
   */
  @ManyToOne({ entity: () => Workspace, fieldName: 'workspace_id', index: true })
  workspace!: Ref<Workspace>;

  /** Email address of the invitee. */
  @Property({ length: 255 })
  email!: string;

  /** Role to grant on acceptance. Never `owner` (BR-F03b). */
  @Property({ length: 20 })
  role!: 'editor' | 'viewer';

  /** 64-character hex token sent in the invitation email. Unique and single-use. */
  @Property({ length: 64 })
  @Unique()
  token!: string;

  /** Current status of the invitation. */
  @Property({ length: 15, default: 'pending' })
  status: InvitationStatus = 'pending';

  /**
   * UUID of the user who issued the invitation. Logical FK to `core.users.id`
   * (cross-module — BR-R06). Indexed for audit queries (BR-R08).
   */
  @Property({ type: 'uuid' })
  @Index()
  invitedByUserId!: string;

  /** Expiry timestamp. Defaults to 7 days from creation. */
  @Property({ type: 'timestamptz' })
  expiresAt!: Date;

  /** Timestamp when the invitation was created. */
  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  // ---------------------------------------------------------------------------
  // Factory helper
  // ---------------------------------------------------------------------------

  /**
   * Creates a new pending invitation.
   *
   * @param workspace       - The target workspace entity.
   * @param email           - Invitee's email address.
   * @param role            - Role to grant on acceptance (`editor` or `viewer`).
   * @param token           - 64-char hex token for the magic-link email.
   * @param invitedByUserId - UUID of the issuing user.
   */
  static create(
    workspace: Workspace,
    email: string,
    role: 'editor' | 'viewer',
    token: string,
    invitedByUserId: string,
  ): Invitation {
    const inv = new Invitation();
    inv.workspace = ref(workspace);
    inv.email = email;
    inv.role = role;
    inv.token = token;
    inv.invitedByUserId = invitedByUserId;
    inv.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return inv;
  }
}
