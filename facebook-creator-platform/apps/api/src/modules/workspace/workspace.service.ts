import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Result, ok, err } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { IEventBus } from '../../common/events/event-bus.port';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Invitation } from './entities/invitation.entity';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import { IInvitationRepository } from './ports/invitation.repository.port';
import { IPostRepository } from '../posts/ports/post.repository.port';
import { IFacebookAccountRepository } from '../facebook/ports/facebook-account.repository.port';
import { MemberInvitedEvent } from './events/member-invited.event';
import { MemberJoinedEvent } from './events/member-joined.event';
import { MemberRemovedEvent } from './events/member-removed.event';
import { MemberRoleChangedEvent } from './events/member-role-changed.event';
import { WorkspaceDeletedEvent } from './events/workspace-deleted.event';
import type { CreateWorkspaceDto } from './dto/workspace.dto';
import type { InviteMemberDto } from './dto/invite-member.dto';
import type { WorkspaceRole } from '../identity/types/workspace-role.type';
import type { ListMembersQuery, MembersPage } from './ports/workspace-member.repository.port';
import type { ListWorkspacesQuery, WorkspacesPage } from './ports/workspace.repository.port';

/**
 * Application service for workspace lifecycle and member management.
 *
 * All mutating methods return `Result<T, AppError>` — never throws for domain errors.
 * Depends only on abstract ports; no ORM or SDK imports.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaces: IWorkspaceRepository,
    private readonly members: IWorkspaceMemberRepository,
    private readonly invitations: IInvitationRepository,
    private readonly eventBus: IEventBus,
    private readonly posts: IPostRepository,
    private readonly facebookAccounts: IFacebookAccountRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Workspace CRUD (T1.4)
  // ---------------------------------------------------------------------------

  /**
   * Creates a new workspace and seeds the requesting user as its owner member.
   *
   * The workspace + membership are persisted in a single flush (one transaction).
   * A URL-safe slug is derived from the name; returns `CONFLICT` if already taken.
   *
   * @param dto     - Validated create payload (name, optional description).
   * @param ownerId - UUID of the authenticated user who will own the workspace.
   * @returns `ok(workspace)` or `err(CONFLICT)` when the slug is already in use.
   */
  async create(dto: CreateWorkspaceDto, ownerId: string): Promise<Result<Workspace, AppError>> {
    const slug = this.toSlug(dto.name);

    if (await this.workspaces.existsBySlug(slug)) {
      return err(AppError.conflict(`A workspace with slug "${slug}" already exists`));
    }

    const workspace = new Workspace();
    workspace.name = dto.name;
    workspace.slug = slug;
    workspace.ownerUserId = ownerId;
    if (dto.description) workspace.description = dto.description;

    const ownerMember = WorkspaceMember.forOwner(workspace, ownerId);

    this.members.persist(ownerMember);
    await this.workspaces.save(workspace);

    return ok(workspace);
  }

  /**
   * Returns a page of active workspaces where the user holds any membership role.
   *
   * @param userId - UUID of the authenticated user.
   * @param query  - Pagination options (limit, cursor).
   * @returns `ok(page)` — empty page when the user has no memberships.
   */
  async listForUser(userId: string, query?: ListWorkspacesQuery): Promise<Result<WorkspacesPage, AppError>> {
    const page = await this.workspaces.findAllByUserId(userId, query);
    return ok(page);
  }

  /**
   * Fetches a single workspace by id, scoped to the requesting user's membership.
   *
   * Returns `NOT_FOUND` when the workspace does not exist, is soft-deleted, or
   * the user is not a member (avoids leaking workspace existence to non-members).
   *
   * Two queries run in parallel (§12): load workspace + check membership simultaneously.
   * Previously three serial queries were issued (findById + findAllByUserId which itself
   * does two round-trips). The membership check now targets a single row by (workspaceId,
   * userId) hitting the `uq_workspace_member` unique index.
   *
   * @param id     - UUID of the workspace.
   * @param userId - UUID of the authenticated user.
   * @returns `ok(workspace)` or `err(NOT_FOUND)`.
   */
  async getById(id: string, userId: string): Promise<Result<Workspace, AppError>> {
    const [workspace, member] = await Promise.all([
      this.workspaces.findById(id),
      this.members.findByWorkspaceAndUserId(id, userId),
    ]);

    if (!workspace || !member) return err(AppError.notFound('Workspace'));

    return ok(workspace);
  }

  // ---------------------------------------------------------------------------
  // Member management (T1.5)
  // ---------------------------------------------------------------------------

  /**
   * Returns a page of members of a workspace, ordered by `joinedAt ASC, id ASC`.
   *
   * @param workspaceId - UUID of the workspace.
   * @param query       - Pagination options (limit, cursor).
   * @returns `ok(page)` — always succeeds; empty page when workspace has no members.
   */
  async listMembers(workspaceId: string, query?: ListMembersQuery): Promise<Result<MembersPage, AppError>> {
    const page = await this.members.findAllByWorkspaceId(workspaceId, query);
    return ok(page);
  }

  /**
   * Returns a single workspace member by their membership record id.
   *
   * @param workspaceId - UUID of the workspace.
   * @param memberId    - UUID of the `WorkspaceMember` record.
   * @returns `ok(member)` or `err(NOT_FOUND)`.
   */
  async getMember(workspaceId: string, memberId: string): Promise<Result<WorkspaceMember, AppError>> {
    const member = await this.members.findByWorkspaceAndId(workspaceId, memberId);
    if (!member) return err(AppError.notFound('WorkspaceMember'));
    return ok(member);
  }

  /**
   * Issues a workspace invitation for the given email address.
   *
   * Returns `CONFLICT` when a pending invitation for the same email already exists
   * in this workspace. Role must be `editor` or `viewer` (BR-F03b; enforced by DTO).
   *
   * Emits `MemberInvitedEvent` after the invitation is persisted (§6).
   *
   * @param workspaceId     - UUID of the workspace to invite into.
   * @param dto             - Invite payload: email + role.
   * @param invitedByUserId - UUID of the user issuing the invitation.
   * @returns `ok(invitation)` or `err(NOT_FOUND | CONFLICT)`.
   */
  async inviteMember(
    workspaceId: string,
    dto: InviteMemberDto,
    invitedByUserId: string,
  ): Promise<Result<Invitation, AppError>> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) return err(AppError.notFound('Workspace'));

    const duplicate = await this.invitations.findPendingByWorkspaceAndEmail(workspaceId, dto.email);
    if (duplicate) {
      return err(AppError.conflict(`A pending invitation for ${dto.email} already exists`));
    }

    const token = randomBytes(32).toString('hex');
    const invitation = Invitation.create(workspace, dto.email, dto.role, token, invitedByUserId);

    await this.invitations.save(invitation);

    await this.eventBus.publish(
      new MemberInvitedEvent(workspaceId, invitation.id, dto.email, dto.role, invitedByUserId),
    );

    return ok(invitation);
  }

  /**
   * Removes a member from a workspace.
   *
   * Enforces BR-R02: if the member is the sole owner, removal is forbidden.
   * Emits `MemberRemovedEvent` after the record is deleted (§6).
   *
   * @param workspaceId        - UUID of the workspace.
   * @param memberId           - UUID of the membership record to remove.
   * @param removedByUserId    - UUID of the user performing the removal.
   * @returns `ok(void)` or `err(NOT_FOUND | FORBIDDEN)`.
   */
  async removeMember(
    workspaceId: string,
    memberId: string,
    removedByUserId: string,
  ): Promise<Result<void, AppError>> {
    const member = await this.members.findByWorkspaceAndId(workspaceId, memberId);
    if (!member) return err(AppError.notFound('WorkspaceMember'));

    if (member.role === 'owner') {
      const ownerCount = await this.members.countOwners(workspaceId);
      if (ownerCount <= 1) {
        return err(AppError.forbidden('Cannot remove the sole owner of a workspace (BR-R02)'));
      }
    }

    const removedUserId = member.userId;
    await this.members.remove(member);

    await this.eventBus.publish(new MemberRemovedEvent(workspaceId, removedUserId, removedByUserId));

    return ok(undefined);
  }

  // ---------------------------------------------------------------------------
  // Invitation acceptance (T2.8)
  // ---------------------------------------------------------------------------

  /**
   * Accepts a workspace invitation identified by its single-use token.
   *
   * Validates the token exists, belongs to the given workspace, is still `pending`,
   * and has not expired (BR-F03). Creates a `WorkspaceMember` and marks the invitation
   * `accepted` in a single flush. Emits `MemberJoinedEvent` after commit (§6).
   *
   * @param workspaceId - UUID from the URL; must match the invitation's workspace.
   * @param token       - 64-char hex token from the invitation email link.
   * @param userId      - UUID of the authenticated user accepting the invite.
   * @returns `ok(member)` or `err(NOT_FOUND | VALIDATION_ERROR | CONFLICT)`.
   */
  async acceptInvitation(
    workspaceId: string,
    token: string,
    userId: string,
  ): Promise<Result<WorkspaceMember, AppError>> {
    const invitation = await this.invitations.findByToken(token);
    if (!invitation || invitation.workspace.id !== workspaceId) {
      return err(AppError.notFound('Invitation'));
    }

    if (invitation.status === 'accepted') {
      return err(AppError.conflict('Invitation has already been accepted'));
    }

    if (invitation.status !== 'pending' || invitation.expiresAt <= new Date()) {
      return err(new AppError('VALIDATION_ERROR', 'Invitation has expired or is no longer valid'));
    }

    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) return err(AppError.notFound('Workspace'));

    const existing = await this.members.findByWorkspaceAndUserId(workspaceId, userId);
    if (existing) return err(AppError.conflict('User is already a member of this workspace'));

    // Mutate invitation status — entity is tracked by EM; flush below commits this too.
    invitation.status = 'accepted';

    const member = WorkspaceMember.forAcceptedInvite(workspace, userId, invitation.role);
    // save() calls em.persist(member) + em.flush() which commits both the invitation
    // status mutation and the member insert in one transaction (§6).
    await this.members.save(member);

    await this.eventBus.publish(
      new MemberJoinedEvent(workspaceId, userId, invitation.role, invitation.id),
    );

    return ok(member);
  }

  // ---------------------------------------------------------------------------
  // Role management (T2.8)
  // ---------------------------------------------------------------------------

  /**
   * Changes the role of an existing workspace member.
   *
   * Enforces BR-R02: an owner cannot be demoted if they are the sole owner.
   * Emits `MemberRoleChangedEvent` after the update is flushed (§6, ADR-052).
   *
   * @param workspaceId     - UUID of the workspace.
   * @param targetUserId    - UUID of the user whose role is being changed.
   * @param newRole         - Role to assign.
   * @param changedByUserId - UUID of the requesting user (must be owner, enforced by guard).
   * @returns `ok(member)` or `err(NOT_FOUND | FORBIDDEN)`.
   */
  async changeMemberRole(
    workspaceId: string,
    targetUserId: string,
    newRole: WorkspaceRole,
    changedByUserId: string,
  ): Promise<Result<WorkspaceMember, AppError>> {
    const member = await this.members.findByWorkspaceAndUserId(workspaceId, targetUserId);
    if (!member) return err(AppError.notFound('WorkspaceMember'));

    if (member.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await this.members.countOwners(workspaceId);
      if (ownerCount <= 1) {
        return err(AppError.forbidden('Cannot demote the sole owner of a workspace (BR-R02)'));
      }
    }

    const oldRole = member.role;
    member.role = newRole;
    await this.members.save(member);

    await this.eventBus.publish(
      new MemberRoleChangedEvent(workspaceId, targetUserId, oldRole, newRole, changedByUserId),
    );

    return ok(member);
  }

  // ---------------------------------------------------------------------------
  // Workspace deletion (W-1, ADR-105)
  // ---------------------------------------------------------------------------

  /**
   * Soft-deletes a workspace and all its dependent aggregates in a single flush (§6).
   *
   * **Cascade order** (required by FK `ON DELETE RESTRICT` constraints):
   * 1. Verify the requesting user is the workspace owner (`role = 'owner'`).
   * 2. BR-R02 — sole-owner guard: deletion is only allowed when the requesting owner
   *    is the sole remaining member. If other members exist, the operation is rejected
   *    with CONFLICT so those members are not silently orphaned.
   * 3. Soft-delete all non-terminal posts (`draft`, `scheduled`, `publishing`) — marks
   *    `deletedAt` in the UoW; returns entities for post-commit event emission.
   * 4. Soft-delete all `FacebookAccount` rows — marks `deletedAt` in the UoW.
   * 5. Soft-delete the workspace row.
   * 6. Single `em.flush()` — all mutations committed atomically.
   * 7. Best-effort billing subscription cancellation via TCP (after commit — a billing
   *    outage must not block workspace deletion).
   * 8. Publish `PostCancelledEvent` × N + `WorkspaceDeletedEvent` after commit (§6).
   *
   * @param workspaceId - UUID of the workspace to delete.
   * @param userId      - UUID of the authenticated user requesting deletion (must be owner).
   * @returns `ok(void)` on success, or `err(NOT_FOUND | FORBIDDEN)`.
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<Result<void, AppError>> {
    // Fix 1: bypass soft-delete filter to distinguish "never existed" from "already deleted".
    const workspace = await this.workspaces.findByIdIncludingDeleted(workspaceId);
    if (!workspace) return err(AppError.notFound('Workspace'));
    // Idempotent: a second DELETE on an already-deleted workspace returns 204.
    if (workspace.deletedAt) return ok(undefined);

    const member = await this.members.findByWorkspaceAndUserId(workspaceId, userId);
    if (!member || member.role !== 'owner') {
      return err(AppError.forbidden('Only the workspace owner can delete the workspace'));
    }

    // BR-R02: deletion is only allowed when the owner is the last (sole) member.
    const totalMemberCount = await this.members.countByWorkspace(workspaceId);
    if (totalMemberCount > 1) {
      return err(
        AppError.conflict(
          'Cannot delete a workspace with other members. Remove all members first (BR-R02)',
        ),
      );
    }

    // Collect cascade mutations without flushing (§6 — one flush only).
    // Fix 2: returns count, not Post[]; no per-post events (workspace event carries the count).
    const cancelledPostCount = await this.posts.softDeleteNonTerminalByWorkspace(workspaceId);
    await this.facebookAccounts.softDeleteAllByWorkspace(workspaceId);

    workspace.deletedAt = new Date();
    await this.workspaces.save(workspace); // single em.flush()

    // Fix 4: billing cancel removed from here — services/billing consumes WorkspaceDeletedEvent
    // via choreography (ADR-109). No direct TCP call; no best-effort try/catch needed.

    // Fix 5: richer event payload; Fix 2: single event replaces N PostCancelledEvents.
    await this.eventBus.publish(
      new WorkspaceDeletedEvent(
        workspaceId,
        workspace.name,
        userId,
        workspace.deletedAt,
        cancelledPostCount,
        totalMemberCount,
      ),
    );

    return ok(undefined);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Converts a display name into a lowercase hyphenated slug (max 120 chars). */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }
}
