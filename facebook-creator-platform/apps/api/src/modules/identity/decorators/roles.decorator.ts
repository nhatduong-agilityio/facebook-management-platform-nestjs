import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from '../types/workspace-role.type';

/**
 * Metadata key used by `WorkspaceRolesGuard` to read required roles.
 */
export const ROLES_KEY = 'roles';

/**
 * Declares the minimum workspace roles required to access a route.
 *
 * Any of the listed roles (or a higher role) will be accepted.
 * Evaluated by `WorkspaceRolesGuard`, which reads the caller's role from
 * `core.workspace_members` using the `:workspaceId` route parameter.
 *
 * @param roles - One or more `WorkspaceRole` values that are permitted.
 *
 * @example
 * ```ts
 * @Roles('owner', 'editor')
 * @UseGuards(ClerkAuthGuard, WorkspaceRolesGuard)
 * @Post('/workspaces/:workspaceId/posts')
 * create(...) { ... }
 * ```
 */
export const Roles = (...roles: WorkspaceRole[]) => SetMetadata(ROLES_KEY, roles);
