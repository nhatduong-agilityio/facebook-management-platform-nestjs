import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { InvitationStatus } from '../entities/invitation.entity';
import type { WorkspaceRole } from '../../identity/types/workspace-role.type';

/**
 * Request body for `POST /workspaces/:workspaceId/members/invite`.
 */
export class InviteMemberDto {
  /** Email address of the person to invite. */
  @ApiProperty({ example: 'editor@example.com' })
  @IsEmail()
  email!: string;

  /**
   * Role to grant on acceptance. Never `owner` (BR-F03b).
   */
  @ApiProperty({ example: 'editor', enum: ['editor', 'viewer'] })
  @IsString()
  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}

/**
 * Response body for a single workspace member.
 */
export class WorkspaceMemberResponseDto {
  /** UUID v7 of the membership record. */
  @ApiProperty({ example: '019612ab-...' })
  id!: string;

  /** UUID of the workspace. */
  @ApiProperty({ example: '019612ab-...' })
  workspaceId!: string;

  /** UUID of the member user. */
  @ApiProperty({ example: '019612ab-...' })
  userId!: string;

  /** Role held within the workspace. */
  @ApiProperty({ example: 'editor', enum: ['owner', 'editor', 'viewer'] })
  role!: WorkspaceRole;

  /** ISO 8601 timestamp when the user joined. */
  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  joinedAt!: Date;
}

/**
 * Request body for `PATCH /workspaces/:id/members/:userId/role`.
 */
export class ChangeRoleDto {
  /**
   * New role to assign. Owners can promote to `owner` or demote to `editor`/`viewer`,
   * subject to the sole-owner guard (BR-R02).
   */
  @ApiProperty({ example: 'editor', enum: ['owner', 'editor', 'viewer'] })
  @IsString()
  @IsIn(['owner', 'editor', 'viewer'])
  role!: WorkspaceRole;
}

/**
 * Query parameters for `GET /workspaces/:id/members`.
 *
 * Supports keyset pagination: pass `nextCursor` from the previous response as
 * `cursor` to advance to the next page.
 */
export class ListWorkspaceMembersQueryDto {
  /**
   * Maximum number of members to return (1–100). Defaults to 50.
   * The adapter enforces an absolute cap of 100.
   */
  @ApiPropertyOptional({ description: 'Page size (1–100, default 50)', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * Opaque pagination cursor from the previous page's `nextCursor` field.
   * Omit to start from the first page.
   */
  @ApiPropertyOptional({ description: 'Keyset pagination cursor from a previous response' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

/**
 * Paginated response for `GET /workspaces/:id/members`.
 *
 * Pass `nextCursor` as `?cursor=<value>` on the next request to get the next page.
 * `nextCursor` is `null` when there are no further pages.
 */
export class WorkspaceMembersPageDto {
  /** Members on this page, ordered by join date ascending. */
  @ApiProperty({ type: [WorkspaceMemberResponseDto] })
  data!: WorkspaceMemberResponseDto[];

  /**
   * Opaque cursor for the next page.
   * Pass as `?cursor=<value>` to continue. `null` means this is the last page.
   */
  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}

/**
 * Response body for workspace invitation endpoints.
 */
export class InvitationResponseDto {
  /** UUID v7 of the invitation record. */
  @ApiProperty({ example: '019612ab-...' })
  id!: string;

  /** UUID of the target workspace. */
  @ApiProperty({ example: '019612ab-...' })
  workspaceId!: string;

  /** Invited email address. */
  @ApiProperty({ example: 'editor@example.com' })
  email!: string;

  /** Role to be granted on acceptance. */
  @ApiProperty({ example: 'editor', enum: ['editor', 'viewer'] })
  role!: 'editor' | 'viewer';

  /** Current status of the invitation. */
  @ApiProperty({ example: 'pending', enum: ['pending', 'accepted', 'expired', 'revoked'] })
  status!: InvitationStatus;

  /** ISO 8601 expiry timestamp (7 days from creation). */
  @ApiProperty({ example: '2026-07-08T00:00:00.000Z' })
  expiresAt!: Date;

  /** ISO 8601 creation timestamp. */
  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt!: Date;
}
