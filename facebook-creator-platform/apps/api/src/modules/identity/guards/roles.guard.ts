import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '../entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLE_HIERARCHY, type WorkspaceRole } from '../types/workspace-role.type';
import { IdentityService } from '../identity.service';

/**
 * Guard that enforces workspace-scoped RBAC.
 *
 * Must run after `ClerkAuthGuard` (which populates `request.user`).
 * Reads required roles from `@Roles(...)` metadata and compares against
 * the calling user's actual role in `core.workspace_members`.
 *
 * Routes without `@Roles(...)` metadata are passed through unconditionally.
 * Returns `false` (403) when the user has no membership or insufficient role.
 */
@Injectable()
export class WorkspaceRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Evaluates whether the authenticated user holds a sufficient workspace role.
   *
   * @param context - NestJS execution context providing route metadata and HTTP request.
   * @returns `true` when the user passes; `false` to send a 403.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<WorkspaceRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: User }>();
    const user = request.user;
    if (!user) return false;

    const workspaceId = (request.params as Record<string, string>).workspaceId;
    if (!workspaceId) return false;

    const result = await this.identityService.getUserWorkspaceRole(user.id, workspaceId);

    return result.match(
      (role) => {
        if (role === null) return false;
        const minRequired = Math.min(...required.map((r) => ROLE_HIERARCHY[r]));
        return ROLE_HIERARCHY[role] >= minRequired;
      },
      () => false,
    );
  }
}
