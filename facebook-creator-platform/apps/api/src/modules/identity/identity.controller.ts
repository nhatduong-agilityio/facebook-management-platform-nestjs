import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthMeResponseDto } from './dto/auth-me-response.dto';
import type { User } from './entities/user.entity';

/**
 * Identity endpoints: authentication probe and current-user profile.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class IdentityController {
  /**
   * Returns the authenticated user's profile.
   *
   * Used by frontend clients to verify token validity and prefetch the user object
   * after sign-in. The route is protected by `ClerkAuthGuard`, so a valid Clerk JWT
   * must be present in the `Authorization: Bearer <token>` header.
   *
   * @param user - Injected by `@CurrentUser()` from `request.user` (set by the guard).
   * @returns The caller's sanitised user profile.
   */
  @Get('me')
  @UseGuards(ClerkAuthGuard)
  @ApiOkResponse({ type: AuthMeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  getMe(@CurrentUser() user: User): AuthMeResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      status: user.status,
    };
  }
}
