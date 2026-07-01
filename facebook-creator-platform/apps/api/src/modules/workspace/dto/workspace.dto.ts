import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for `POST /workspaces`.
 */
export class CreateWorkspaceDto {
  /**
   * Display name of the workspace. 2–100 characters (BR-F01).
   * A URL-safe slug is derived from this value automatically.
   */
  @ApiProperty({ example: 'My Brand', description: 'Workspace display name (2–100 chars)' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  /** Optional longer description. Max 500 characters. */
  @ApiPropertyOptional({ example: 'Content calendar for our Facebook pages', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * Response body for workspace read endpoints.
 */
export class WorkspaceResponseDto {
  /** UUID v7 of the workspace. */
  @ApiProperty({ example: '019612ab-...' })
  id!: string;

  /** Display name. */
  @ApiProperty({ example: 'My Brand' })
  name!: string;

  /** URL-safe slug derived from the name. Unique across all workspaces. */
  @ApiProperty({ example: 'my-brand' })
  slug!: string;

  /** Optional description. */
  @ApiPropertyOptional({ example: 'Content calendar for our Facebook pages' })
  description?: string;

  /** Lifecycle state of the workspace. */
  @ApiProperty({ example: 'active', enum: ['active', 'suspended'] })
  status!: string;

  /** UUID of the owning user. */
  @ApiProperty({ example: '019612ab-...' })
  ownerUserId!: string;

  /** ISO 8601 creation timestamp. */
  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt!: Date;

  /** ISO 8601 last-update timestamp. */
  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: Date;
}
