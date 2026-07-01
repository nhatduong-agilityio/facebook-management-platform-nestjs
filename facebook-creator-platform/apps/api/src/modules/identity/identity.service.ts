import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { User } from './entities/user.entity';
import { IUserRepository } from './ports/user.repository.port';
import { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import { IIdentityProvider } from './ports/identity-provider.port';
import type { WorkspaceRole } from './types/workspace-role.type';

/**
 * Core identity service: user upsert on first sign-in and workspace role resolution.
 *
 * Depends exclusively on ports — no ORM types, no SDK imports, no config reads.
 * All public methods return `Result<T, AppError>` — never throw for domain errors.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
    private readonly identityProvider: IIdentityProvider,
  ) {}

  /**
   * Finds an existing user by their provider id, or creates one by fetching the
   * profile from the external identity provider on first sign-in.
   *
   * An `inactive` account is denied even when the JWT is valid (BR-R03).
   *
   * @param clerkUserId - The `sub` claim from a verified Clerk JWT.
   * @returns `ok(user)` on success; `err(FORBIDDEN)` if the account is inactive.
   */
  async getOrCreateUser(clerkUserId: string): Promise<Result<User, AppError>> {
    let user = await this.userRepository.findByClerkId(clerkUserId);

    if (!user) {
      const profile = await this.identityProvider.getProfile(clerkUserId);
      const nameParts = [profile.firstName, profile.lastName].filter(Boolean);

      user = new User();
      user.clerkUserId = clerkUserId;
      user.email = profile.email;
      user.fullName = nameParts.length > 0 ? nameParts.join(' ') : undefined;
      user.avatarUrl = profile.avatarUrl;

      await this.userRepository.save(user);
    }

    if (user.status === 'inactive') {
      return err(new AppError('FORBIDDEN', 'Account is inactive'));
    }

    return ok(user);
  }

  /**
   * Resolves the calling user's role in a workspace.
   *
   * Returns `null` when the user has no active membership.
   * The `core.workspace_members` table is created in T1.4; this method will
   * function at runtime once that migration is applied.
   *
   * @param userId      - Internal UUID v7 of the authenticated user.
   * @param workspaceId - UUID v7 of the target workspace (from route params).
   * @returns `ok(role)` — the member's role string, or `null` if not a member.
   */
  async getUserWorkspaceRole(
    userId: string,
    workspaceId: string,
  ): Promise<Result<WorkspaceRole | null, AppError>> {
    const role = await this.workspaceMemberRepository.findRole(userId, workspaceId);
    return ok(role);
  }
}
