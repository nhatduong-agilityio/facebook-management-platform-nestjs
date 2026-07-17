import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

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
 * Query parameters for `GET /workspaces`.
 *
 * Supports keyset pagination: pass `nextCursor` from the previous response as
 * `cursor` to advance to the next page.
 */
export class ListWorkspacesQueryDto {
  /**
   * Maximum number of workspaces to return (1–100). Defaults to 50.
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
 * Paginated response for `GET /workspaces`.
 *
 * Pass `nextCursor` as `?cursor=<value>` on the next request to get the next page.
 * `nextCursor` is `null` when there are no further pages.
 */
export class WorkspacesPageDto {
  /** Workspaces on this page, ordered newest first. */
  data!: WorkspaceResponseDto[];

  /**
   * Opaque cursor for the next page.
   * Pass as `?cursor=<value>` to continue. `null` means this is the last page.
   */
  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
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
