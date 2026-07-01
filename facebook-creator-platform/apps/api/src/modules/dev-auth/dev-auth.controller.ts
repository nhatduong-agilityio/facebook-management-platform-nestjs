import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevAuthService } from './dev-auth.service';
import { DevAuthTokenDto, DevAuthTokenResponseDto } from './dto/dev-auth-token.dto';

/**
 * Development-only controller that exposes a token-generation endpoint for
 * manual API testing with Postman or similar REST clients.
 *
 * All routes are unprotected — this controller only exists when
 * `NODE_ENV !== 'production'` (enforced by `DevAuthModule` import guard in `AppModule`).
 */
@ApiTags('dev-auth')
@Controller('dev-auth')
export class DevAuthController {
  constructor(private readonly devAuthService: DevAuthService) {}

  /**
   * Returns a Clerk session JWT for Postman testing.
   *
   * - **Session exists** → `{ accessToken }` — set as Bearer token and test immediately.
   * - **No session** → `{ loginUrl }` — open in a browser, Clerk creates a session,
   *   then call this endpoint again to receive `accessToken`.
   *
   * @param dto - User identifier and optional JWT template slug.
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a Clerk access token for Postman testing (dev only)',
    description:
      'Returns { accessToken } when the user has an active session, or { loginUrl } ' +
      'when they do not. Open loginUrl in a browser to create a session, then call again. ' +
      'Supply a `template` slug (Clerk Dashboard → JWT Templates) for a longer-lived token.',
  })
  generateToken(@Body() dto: DevAuthTokenDto): Promise<DevAuthTokenResponseDto> {
    return this.devAuthService.generateToken(dto);
  }
}
