import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Plan summary embedded in `SubscriptionResponseDto`.
 */
export class PlanSummaryDto {
  /** Short plan code (e.g. `free`, `pro`, `team`). */
  @ApiProperty({ description: 'Plan code.', example: 'pro' })
  code!: string;

  /** Human-readable plan name. */
  @ApiProperty({ description: 'Plan display name.', example: 'Pro' })
  name!: string;

  /** Maximum non-deleted posts allowed for this plan. */
  @ApiProperty({ description: 'Maximum posts allowed.', example: 500 })
  postLimit!: number;
}

/**
 * Response shape for `GET /workspaces/:id/subscription`.
 *
 * Mirrors `SubscriptionResponse` from `@fcp/billing-contracts`.
 * Stripe IDs are never included.
 */
export class SubscriptionResponseDto {
  /** UUID v7 of the subscription record. */
  @ApiProperty({ description: 'Subscription UUID.', example: '01900000-0000-7000-8000-000000000001' })
  id!: string;

  /** UUID of the owning workspace. */
  @ApiProperty({ description: 'Workspace UUID.', example: '01900000-0000-7000-8000-000000000002' })
  workspaceId!: string;

  /** Current subscription lifecycle status. */
  @ApiProperty({
    description: 'Subscription status.',
    enum: ['trialing', 'active', 'grace_period', 'past_due', 'cancelled'],
    example: 'active',
  })
  status!: 'trialing' | 'active' | 'grace_period' | 'past_due' | 'cancelled';

  /** Plan details for this subscription. */
  @ApiProperty({ type: PlanSummaryDto })
  plan!: PlanSummaryDto;

  /** Start of the current billing period. `null` until first Stripe activation. */
  @ApiPropertyOptional({ nullable: true, type: String, description: 'ISO 8601 billing period start.', example: '2026-07-01T00:00:00Z' })
  currentPeriodStart!: string | null;

  /** End of the current billing period. `null` until first Stripe activation. */
  @ApiPropertyOptional({ nullable: true, type: String, description: 'ISO 8601 billing period end.', example: '2026-08-01T00:00:00Z' })
  currentPeriodEnd!: string | null;

  /** End of grace period. Non-null only when `status === "grace_period"`. */
  @ApiPropertyOptional({ nullable: true, type: String, description: 'ISO 8601 grace period end.', example: '2026-07-22T00:00:00Z' })
  gracePeriodEnd!: string | null;

  /** ISO 8601 timestamp when the subscription was created. */
  @ApiProperty({ description: 'Creation timestamp.', example: '2026-07-01T12:00:00Z' })
  createdAt!: string;

  /** ISO 8601 timestamp when the subscription was last modified. */
  @ApiProperty({ description: 'Last-modified timestamp.', example: '2026-07-15T09:30:00Z' })
  updatedAt!: string;
}
