import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * Request body for `POST /workspaces/:id/billing/checkout`.
 */
export class CreateCheckoutDto {
  /**
   * The plan the workspace wants to subscribe to.
   * Must be `pro` or `team` — the free plan has no Stripe checkout flow.
   */
  @ApiProperty({
    enum: ['pro', 'team'],
    description: 'Plan code to start a Stripe Checkout session for.',
    example: 'pro',
  })
  @IsIn(['pro', 'team'])
  planCode!: string;
}
