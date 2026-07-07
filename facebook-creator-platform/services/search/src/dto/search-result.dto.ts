import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shape of a single Algolia hit returned by the search endpoint.
 *
 * Mirrors the fields written by the five post-event consumers. Used both
 * as the `services/search` HTTP response type and re-exported via `@fcp/search-contracts`
 * (when a contracts lib is added) for `apps/api` to consume.
 */
export class SearchResultDto {
  /** UUID v7 of the post (Algolia `objectID`). */
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

  /** Current post status in the publishing state machine. */
  @ApiProperty()
  status!: string;

  /** ISO timestamp when the post was (or is) scheduled to publish. */
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
