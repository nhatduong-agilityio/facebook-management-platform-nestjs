import { ApiProperty } from '@nestjs/swagger';

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
