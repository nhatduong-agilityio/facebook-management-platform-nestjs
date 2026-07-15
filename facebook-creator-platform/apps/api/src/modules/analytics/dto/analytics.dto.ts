import { ApiProperty } from '@nestjs/swagger';

/**
 * Daily engagement metrics for a single post.
 *
 * Returned by `GET /workspaces/:id/posts/:postId/analytics`.
 * Each element represents one day's Facebook Insights data.
 */
export class PostMetricsDayDto {
  /** UUID v7 of the metric row. */
  @ApiProperty({ description: 'Metric row UUID.', example: '01900000-0000-7000-8000-000000000001' })
  id!: string;

  /** UUID of the post this row belongs to. */
  @ApiProperty({ description: 'Post UUID.', example: '01900000-0000-7000-8000-000000000002' })
  postId!: string;

  /** ISO 8601 date string for this metric bucket. */
  @ApiProperty({ description: 'Date of the metric bucket.', example: '2026-07-15' })
  metricDate!: string;

  /** Number of unique accounts reached on this day. */
  @ApiProperty({ description: 'Unique accounts reached.', example: 420 })
  reach!: number;

  /** Total times the post was displayed on this day. */
  @ApiProperty({ description: 'Total impressions.', example: 1200 })
  impressions!: number;

  /** Likes / reactions on this day. */
  @ApiProperty({ description: 'Likes received.', example: 38 })
  likes!: number;

  /** Comments on this day. */
  @ApiProperty({ description: 'Comments received.', example: 4 })
  comments!: number;

  /** Shares on this day. */
  @ApiProperty({ description: 'Shares on this day.', example: 2 })
  shares!: number;

  /** ISO 8601 timestamp when this row was first ingested. */
  @ApiProperty({ description: 'Row creation timestamp.', example: '2026-07-15T12:00:00Z' })
  createdAt!: string;
}

/**
 * Aggregated engagement metrics for a workspace.
 *
 * Returned by `GET /workspaces/:id/analytics`. Mirrors `MetricsSummary`
 * from `services/analytics` — all fields are non-negative integers.
 */
export class MetricsSummaryDto {
  /** Total reach (unique accounts reached) across all published posts. */
  @ApiProperty({ description: 'Total reach across all published posts.', example: 4200 })
  reach!: number;

  /** Total number of times posts were displayed to any account. */
  @ApiProperty({ description: 'Total impressions across all published posts.', example: 12000 })
  impressions!: number;

  /** Total likes / reactions across all published posts. */
  @ApiProperty({ description: 'Total likes across all published posts.', example: 380 })
  likes!: number;

  /** Total comments across all published posts. */
  @ApiProperty({ description: 'Total comments across all published posts.', example: 47 })
  comments!: number;

  /** Total shares across all published posts. */
  @ApiProperty({ description: 'Total shares across all published posts.', example: 23 })
  shares!: number;
}
