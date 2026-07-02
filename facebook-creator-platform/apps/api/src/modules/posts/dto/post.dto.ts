import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PostStatus } from '../entities/post.entity';

/**
 * Request body for `POST /workspaces/:workspaceId/posts`.
 *
 * `content` is required and must satisfy BR-F02 (1–63,206 characters).
 * All other fields are optional — a post can be created as a bare draft.
 */
export class CreatePostDto {
  /** Optional Page connection to publish to. Must belong to the same workspace (BR-R05). */
  @ApiPropertyOptional({ description: 'UUID v7 of the FacebookAccount (Page) to publish to' })
  @IsOptional()
  @IsUUID()
  facebookAccountId?: string;

  /** Optional display title (max 255 characters). */
  @ApiPropertyOptional({ description: 'Optional post title (max 255 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /**
   * Post body text. Facebook supports up to 63,206 characters (BR-F02).
   * Empty strings are rejected at this layer before hitting the DB CHECK constraint.
   */
  @ApiProperty({ description: 'Post body text (1–63,206 characters — BR-F02)' })
  @IsString()
  @MinLength(1)
  @MaxLength(63206)
  content!: string;

  /** Optional media attachment URL (max 2,048 characters). */
  @ApiPropertyOptional({ description: 'Media attachment URL (max 2,048 chars)' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  mediaUrl?: string;

  /** When to publish; set by the client when scheduling a post (BR-F06). */
  @ApiPropertyOptional({ description: 'ISO-8601 datetime to schedule publishing (BR-F06)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/**
 * Request body for `PATCH /workspaces/:workspaceId/posts/:postId`.
 *
 * All fields are optional — clients send only what changed. Only `draft` and
 * `scheduled` posts can be updated via this endpoint; published/failed posts
 * are immutable (enforced by `PostsService.updatePost`).
 */
export class UpdatePostDto {
  /** Replacement Page connection; must belong to the same workspace (BR-R05). */
  @ApiPropertyOptional({ description: 'New FacebookAccount UUID to switch the target Page' })
  @IsOptional()
  @IsUUID()
  facebookAccountId?: string;

  /** Replacement title. */
  @ApiPropertyOptional({ description: 'Replacement title (max 255 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /** Replacement body text (must satisfy BR-F02 if provided). */
  @ApiPropertyOptional({ description: 'Replacement body text (1–63,206 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(63206)
  content?: string;

  /** Replacement media URL. */
  @ApiPropertyOptional({ description: 'Replacement media URL (max 2,048 chars)' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  mediaUrl?: string;

  /** Replacement scheduled datetime. */
  @ApiPropertyOptional({ description: 'Replacement scheduled datetime (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/**
 * API response shape for a `Post`. Omits ORM internals and contains no PII.
 * The `Post` entity has no sensitive fields (tokens live on `FacebookAccount`).
 */
export class PostResponseDto {
  /** UUID v7 primary key. */
  @ApiProperty() id!: string;
  /** UUID of the owning workspace. */
  @ApiProperty() workspaceId!: string;
  /** UUID of the connected Page, if any. */
  @ApiPropertyOptional() facebookAccountId?: string;
  /** UUID of the creating user. */
  @ApiProperty() createdByUserId!: string;
  /** Optional title. */
  @ApiPropertyOptional() title?: string;
  /** Post body. */
  @ApiProperty() content!: string;
  /** Optional media URL. */
  @ApiPropertyOptional() mediaUrl?: string;
  /** Current lifecycle status. */
  @ApiProperty() status!: PostStatus;
  /** Graph API post id; set when status is `publishing` or `published`. */
  @ApiPropertyOptional() facebookGraphPostId?: string;
  /** Scheduled publish time. */
  @ApiPropertyOptional() scheduledAt?: Date;
  /** Actual publish time; set when `published`. */
  @ApiPropertyOptional() publishedAt?: Date;
  /** Last failure message; set when `failed`. */
  @ApiPropertyOptional() lastError?: string;
  /** Creation timestamp. */
  @ApiProperty() createdAt!: Date;
  /** Last update timestamp. */
  @ApiProperty() updatedAt!: Date;
}
