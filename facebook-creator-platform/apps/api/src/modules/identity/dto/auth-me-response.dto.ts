import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserStatus } from '../entities/user.entity';

/**
 * Response body for `GET /auth/me`.
 *
 * PII fields are present for the authenticated user only — never logged.
 */
export class AuthMeResponseDto {
  /** Internal UUID v7 identifier. */
  @ApiProperty()
  id!: string;

  /** Primary email address from Clerk. */
  @ApiProperty()
  email!: string;

  /** Display name from Clerk, if set. */
  @ApiPropertyOptional()
  fullName?: string;

  /** Avatar URL from Clerk, if set. */
  @ApiPropertyOptional()
  avatarUrl?: string;

  /** Account lifecycle state. */
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: UserStatus;
}
