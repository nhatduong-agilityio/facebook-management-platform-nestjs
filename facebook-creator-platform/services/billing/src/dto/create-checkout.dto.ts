import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import type { CheckoutRequest } from '@fcp/billing-contracts';

/**
 * Request body for `POST /checkout` (internal — called by `apps/api`).
 *
 * Implements `CheckoutRequest` from `@fcp/billing-contracts` so TypeScript
 * enforces that the DTO shape matches the shared contract.
 */
export class CreateCheckoutDto implements CheckoutRequest {
  @ApiProperty({ enum: ['pro', 'team'], example: 'pro' })
  @IsIn(['pro', 'team'])
  planCode!: string;

  @ApiProperty({ example: '01975700-0000-7000-8000-000000000042' })
  @IsUUID()
  workspaceId!: string;
}
