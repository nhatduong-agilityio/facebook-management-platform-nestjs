import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '../entities/user.entity';

/**
 * Route parameter decorator that extracts the authenticated `User` entity from
 * the request object.
 *
 * Requires `ClerkAuthGuard` to run first so that `request.user` is populated.
 *
 * @example
 * ```ts
 * @Get('/auth/me')
 * @UseGuards(ClerkAuthGuard)
 * getMe(@CurrentUser() user: User) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<{ user: User }>();
    return request.user;
  },
);
