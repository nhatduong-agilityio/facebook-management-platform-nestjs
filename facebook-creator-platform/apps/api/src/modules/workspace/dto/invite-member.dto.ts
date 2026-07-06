import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString } from 'class-validator';
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
