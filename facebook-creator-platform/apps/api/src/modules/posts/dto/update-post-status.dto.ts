import { IsISO8601, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PostStatus } from '../entities/post.entity';

/** All valid status values accepted by the state-machine endpoint. */
const POST_STATUSES: PostStatus[] = ['draft', 'scheduled', 'publishing', 'published', 'failed'];

/**
 * Request body for `PATCH /workspaces/:workspaceId/posts/:postId/status`.
 *
 * The service validates that the requested `status` is reachable from the
 * post's current state; invalid transitions return `err(INVALID_STATE_TRANSITION)`.
 *
 * Field requirements by target status:
 * - `scheduled`  — `scheduledAt` required; must be a future datetime (BR-F06).
 * - `publishing` — `facebookGraphPostId` required (set by Publish Job after Graph API call).
 * - `failed`     — `lastError` recommended (Graph API error message).
 * - `draft`      — no extra fields needed (used for retry from `failed` or unschedule from `scheduled`).
 * - `published`  — no extra fields needed; `publishedAt` is set automatically.
 */
export class UpdatePostStatusDto {
  /** Target lifecycle status. Must be reachable from the post's current status. */
  @ApiProperty({
    enum: POST_STATUSES,
    description: 'Target status; must be a valid transition from the current state',
  })
  @IsIn(POST_STATUSES)
  status!: PostStatus;

  /**
   * Required when transitioning to `scheduled`.
   * Must be a future datetime (BR-F06); past values are rejected with VALIDATION_ERROR.
   * Must include a UTC timezone offset — bare local-time strings are rejected.
   * Examples: `2026-08-01T10:00:00.000Z`, `2026-08-01T10:00:00+05:30`.
   */
  @ApiPropertyOptional({
    description: 'ISO-8601 UTC future datetime; required when status = "scheduled" (BR-F06). Timezone offset required — e.g. 2026-08-01T10:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, {
    message: 'scheduledAt must include a UTC timezone offset (e.g. 2026-08-01T10:00:00.000Z)',
  })
  scheduledAt?: string;

  /**
   * Required when transitioning to `publishing`.
   * Set synchronously by the Publish Job after the Graph API responds with a post id.
   * Drives the `publishing → published` webhook match in T2.7.
   */
  @ApiPropertyOptional({
    description: 'Graph API post id; required when status = "publishing"',
  })
  @IsOptional()
  @IsString()
  facebookGraphPostId?: string;

  /**
   * Graph API error message; recommended when transitioning to `failed`.
   * Stored on `Post.lastError`; cleared automatically on `failed → draft` retry.
   */
  @ApiPropertyOptional({
    description: 'Graph API error message; used when status = "failed"',
  })
  @IsOptional()
  @IsString()
  lastError?: string;
}
