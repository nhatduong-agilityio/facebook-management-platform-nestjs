import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shape of a single search result returned by `GET /workspaces/:id/search`.
 *
 * Maps 1:1 from the `SearchResultDto` returned by `services/search`.
 */
export class SearchResultDto {
  /** UUID v7 of the post. */
  @ApiProperty()
  postId!: string;

  /** UUID of the workspace that owns the post. */
  @ApiProperty()
  workspaceId!: string;

  /** Optional post title. */
  @ApiPropertyOptional()
  title?: string;

  /** Post body content. */
  @ApiProperty()
  content!: string;

  /** Current post status. */
  @ApiProperty()
  status!: string;

  /** ISO timestamp for scheduled publish time. */
  @ApiPropertyOptional()
  scheduledAt?: string;

  /** ISO timestamp when the post was created. */
  @ApiProperty()
  createdAt!: string;

  /** Facebook Graph API post id — present once the post is `published`. */
  @ApiPropertyOptional()
  facebookGraphPostId?: string;

  /** ISO timestamp when the post was published. */
  @ApiPropertyOptional()
  publishedAt?: string;

  /** ISO timestamp when the post last failed. */
  @ApiPropertyOptional()
  failedAt?: string;
}
