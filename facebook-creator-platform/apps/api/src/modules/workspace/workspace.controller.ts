import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Roles } from '../identity/decorators/roles.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto, ListWorkspacesQueryDto, WorkspaceResponseDto, WorkspacesPageDto } from './dto/workspace.dto';
import { ChangeRoleDto, InviteMemberDto, InvitationResponseDto, ListWorkspaceMembersQueryDto, WorkspaceMemberResponseDto, WorkspaceMembersPageDto } from './dto/invite-member.dto';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Invitation } from './entities/invitation.entity';
import type { User } from '../identity/entities/user.entity';

/**
 * Workspace CRUD and member management endpoints. All routes require a valid Clerk JWT.
 */
@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  // ---------------------------------------------------------------------------
  // Workspace CRUD
  // ---------------------------------------------------------------------------

  /**
   * Creates a new workspace and sets the authenticated user as its owner.
   *
   * @param dto  - Workspace name and optional description.
   * @param user - Authenticated user injected by `@CurrentUser()`.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a workspace' })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: User): Promise<WorkspaceResponseDto> {
    const result = await this.workspaceService.create(dto, user.id);
    return result.match(
      (ws) => this.toWorkspaceResponse(ws),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Lists workspaces where the authenticated user holds any membership role.
   * Supports keyset pagination via `?limit=` and `?cursor=` query params.
   *
   * @param user  - Authenticated user injected by `@CurrentUser()`.
   * @param query - Pagination options (limit, cursor).
   */
  @Get()
  @ApiOperation({ summary: 'List workspaces for the current user (paginated)' })
  @ApiOkResponse({ type: WorkspacesPageDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async list(@CurrentUser() user: User, @Query() query: ListWorkspacesQueryDto): Promise<WorkspacesPageDto> {
    const result = await this.workspaceService.listForUser(user.id, query);
    return result.match(
      (page) => ({ data: page.data.map((ws) => this.toWorkspaceResponse(ws)), nextCursor: page.nextCursor }),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Returns a single workspace by id, scoped to the authenticated user's membership.
   *
   * @param id   - UUID of the workspace.
   * @param user - Authenticated user injected by `@CurrentUser()`.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a workspace by id' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiNotFoundResponse({ description: 'Workspace not found or user is not a member' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async getById(@Param('id') id: string, @CurrentUser() user: User): Promise<WorkspaceResponseDto> {
    const result = await this.workspaceService.getById(id, user.id);
    return result.match(
      (ws) => this.toWorkspaceResponse(ws),
      (e) => { throw toHttpException(e); },
    );
  }

  // ---------------------------------------------------------------------------
  // Member management
  // ---------------------------------------------------------------------------

  /**
   * Lists members of a workspace, ordered by join date ascending.
   * Supports keyset pagination via `?limit=` and `?cursor=` query params.
   *
   * Accessible to all workspace members (owner, editor, viewer).
   *
   * @param workspaceId - UUID of the workspace.
   * @param query       - Pagination options (limit, cursor).
   */
  @Get(':workspaceId/members')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor', 'viewer')
  @ApiOperation({ summary: 'List members of a workspace (paginated)' })
  @ApiOkResponse({ type: WorkspaceMembersPageDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Not a member of this workspace' })
  async listMembers(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListWorkspaceMembersQueryDto,
  ): Promise<WorkspaceMembersPageDto> {
    const result = await this.workspaceService.listMembers(workspaceId, query);
    return result.match(
      (page) => ({ data: page.data.map((m) => this.toMemberResponse(m)), nextCursor: page.nextCursor }),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Returns a single workspace member by membership record id.
   *
   * Accessible to all workspace members (owner, editor, viewer).
   *
   * @param workspaceId - UUID of the workspace.
   * @param memberId    - UUID of the `WorkspaceMember` record.
   */
  @Get(':workspaceId/members/:memberId')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor', 'viewer')
  @ApiOperation({ summary: 'Get a single workspace member by id' })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  @ApiNotFoundResponse({ description: 'Member not found in workspace' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Not a member of this workspace' })
  async getMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ): Promise<WorkspaceMemberResponseDto> {
    const result = await this.workspaceService.getMember(workspaceId, memberId);
    return result.match(
      (member) => this.toMemberResponse(member),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Invites a user to the workspace by email.
   *
   * Requires Owner or Editor role (`WorkspaceRolesGuard` reads `:workspaceId`).
   * Returns 409 when a pending invitation for the same email already exists.
   * Rate-limited to 5 requests / 60 s / IP to prevent email-send abuse.
   *
   * @param workspaceId - UUID of the target workspace.
   * @param dto         - Email and role for the invitation.
   * @param user        - Authenticated user issuing the invitation.
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post(':workspaceId/members/invite')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @ApiOperation({ summary: 'Invite a member to a workspace' })
  @ApiCreatedResponse({ type: InvitationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient workspace role' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  async inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: User,
  ): Promise<InvitationResponseDto> {
    const result = await this.workspaceService.inviteMember(workspaceId, dto, user.id);
    return result.match(
      (inv) => this.toInvitationResponse(inv),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Removes a member from the workspace.
   *
   * Requires Owner role. Returns 403 when the target is the sole owner (BR-R02).
   *
   * @param workspaceId - UUID of the workspace.
   * @param memberId    - UUID of the membership record to remove.
   * @param user        - Authenticated user performing the removal.
   */
  @Delete(':workspaceId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner')
  @ApiOperation({ summary: 'Remove a member from a workspace' })
  @ApiNoContentResponse({ description: 'Member removed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient role or sole-owner removal (BR-R02)' })
  @ApiNotFoundResponse({ description: 'Member not found in workspace' })
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    const result = await this.workspaceService.removeMember(workspaceId, memberId, user.id);
    result.match(
      () => undefined,
      (e) => { throw toHttpException(e); },
    );
  }

  // ---------------------------------------------------------------------------
  // Invitation acceptance (T2.8)
  // ---------------------------------------------------------------------------

  /**
   * Accepts a workspace invitation using the single-use token from the email link.
   *
   * This endpoint is guarded by `ClerkAuthGuard` (the accepting user must be
   * authenticated) but does NOT require an existing workspace membership — the
   * token is the workspace-level credential. Returns 409 when the invitation was
   * already accepted and 400 when it has expired.
   *
   * @param workspaceId - UUID of the workspace.
   * @param token       - 64-char hex token from the invitation email.
   * @param user        - Authenticated user accepting the invite.
   */
  @Post(':workspaceId/invitations/:token/accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accept a workspace invitation' })
  @ApiCreatedResponse({ type: WorkspaceMemberResponseDto })
  @ApiNotFoundResponse({ description: 'Invitation not found or token/workspace mismatch' })
  @ApiConflictResponse({ description: 'Invitation already accepted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async acceptInvitation(
    @Param('workspaceId') workspaceId: string,
    @Param('token') token: string,
    @CurrentUser() user: User,
  ): Promise<WorkspaceMemberResponseDto> {
    const result = await this.workspaceService.acceptInvitation(workspaceId, token, user.id);
    return result.match(
      (member) => this.toMemberResponse(member),
      (e) => { throw toHttpException(e); },
    );
  }

  // ---------------------------------------------------------------------------
  // Role management (T2.8)
  // ---------------------------------------------------------------------------

  /**
   * Changes the role of an existing workspace member.
   *
   * Requires Owner role. Returns 403 when demoting the sole owner (BR-R02).
   *
   * @param workspaceId - UUID of the workspace.
   * @param userId      - UUID of the user whose role should change.
   * @param dto         - The new role.
   * @param user        - Authenticated user performing the change.
   */
  @Patch(':workspaceId/members/:userId/role')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner')
  @ApiOperation({ summary: 'Change the role of a workspace member' })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  @ApiNotFoundResponse({ description: 'Member not found in workspace' })
  @ApiForbiddenResponse({ description: 'Insufficient role or sole-owner demotion (BR-R02)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async changeMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: User,
  ): Promise<WorkspaceMemberResponseDto> {
    const result = await this.workspaceService.changeMemberRole(workspaceId, userId, dto.role, user.id);
    return result.match(
      (member) => this.toMemberResponse(member),
      (e) => { throw toHttpException(e); },
    );
  }

  // ---------------------------------------------------------------------------
  // Private mappers
  // ---------------------------------------------------------------------------

  /** Maps a `Workspace` entity to the public response shape. */
  private toWorkspaceResponse(ws: Workspace): WorkspaceResponseDto {
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      description: ws.description,
      status: ws.status,
      ownerUserId: ws.ownerUserId,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    };
  }

  /** Maps a `WorkspaceMember` entity to the public response shape. */
  private toMemberResponse(m: WorkspaceMember): WorkspaceMemberResponseDto {
    return {
      id: m.id,
      workspaceId: m.workspace.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
    };
  }

  /** Maps an `Invitation` entity to the public response shape. */
  private toInvitationResponse(inv: Invitation): InvitationResponseDto {
    return {
      id: inv.id,
      workspaceId: inv.workspace.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    };
  }
}
