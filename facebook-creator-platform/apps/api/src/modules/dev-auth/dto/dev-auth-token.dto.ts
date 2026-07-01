import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Request body for `POST /dev-auth/token`.
 * Exactly one of `userId` or `email` must be provided.
 */
export class DevAuthTokenDto {
  /**
   * Clerk user id (starts with `user_`). Takes precedence over `email` if both
   * are supplied.
   */
  @ApiPropertyOptional({ example: 'user_2abc123XYZ', description: 'Clerk user id' })
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * Email address of the Clerk user. Used to look up the Clerk user id when
   * `userId` is not provided.
   */
  @ApiPropertyOptional({ example: 'dev@example.com', description: 'Email address of the Clerk user' })
  @ValidateIf((o: DevAuthTokenDto) => !o.userId)
  @IsString()
  email?: string;

  /**
   * Optional JWT template slug configured in the Clerk dashboard.
   * When omitted, the default session token (60 s TTL) is returned.
   * Templates can have expiration up to 1 year — configure in
   * Clerk Dashboard → JWT Templates.
   */
  @ApiPropertyOptional({ example: 'postman', description: 'Clerk JWT template slug (optional, for longer TTL)' })
  @IsOptional()
  @IsString()
  template?: string;
}

/**
 * Response body for `POST /dev-auth/token`.
 *
 * Two mutually exclusive shapes:
 * - **Session exists** → `{ accessToken }` — paste directly as a Bearer token.
 * - **No session** → `{ loginUrl }` — open in a browser to establish a Clerk
 *   session, then call the endpoint again to receive `accessToken`.
 */
export class DevAuthTokenResponseDto {
  /**
   * Clerk session JWT ready to use as `Authorization: Bearer <accessToken>`.
   * Present only when the user has an active Clerk session.
   */
  @ApiPropertyOptional({ example: 'eyJ...' })
  accessToken?: string;

  /**
   * Magic-link URL to open in a browser when no active session exists.
   * After sign-in Clerk creates a session; the next call to this endpoint
   * returns `accessToken` instead.
   */
  @ApiPropertyOptional({ example: 'https://your-instance.accounts.dev/sign-in#...' })
  loginUrl?: string;
}
