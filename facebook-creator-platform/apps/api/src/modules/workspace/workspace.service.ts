import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { AppError } from '../../common/errors/app-error';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberWriteRepository } from './ports/workspace-member.repository.port';
import type { CreateWorkspaceDto } from './dto/workspace.dto';

/**
 * Application service for workspace lifecycle: create, list, and get.
 *
 * All mutating methods return `Result<T, AppError>` — never throws for domain errors.
 * Depends only on abstract ports; no ORM or SDK imports.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaces: IWorkspaceRepository,
    private readonly members: IWorkspaceMemberWriteRepository,
  ) {}

  /**
   * Creates a new workspace and seeds the requesting user as its owner member.
   *
   * The workspace + membership are persisted in a single flush (one transaction).
   * A URL-safe slug is derived from the name; returns `CONFLICT` if the slug is
   * already taken.
   *
   * @param dto      - Validated create payload (name, optional description).
   * @param ownerId  - UUID v7 of the authenticated user who will own the workspace.
   * @returns `ok(workspace)` or `err(CONFLICT)` when the derived slug is already in use.
   */
  async create(dto: CreateWorkspaceDto, ownerId: string): Promise<Result<Workspace, AppError>> {
    const slug = this.toSlug(dto.name);

    if (await this.workspaces.existsBySlug(slug)) {
      return err(AppError.conflict(`A workspace with slug "${slug}" already exists`));
    }

    const workspace = new Workspace();
    workspace.name = dto.name;
    workspace.slug = slug;
    workspace.ownerUserId = ownerId;
    if (dto.description) workspace.description = dto.description;

    const ownerMember = new WorkspaceMember();
    ownerMember.workspaceId = workspace.id;
    ownerMember.userId = ownerId;
    ownerMember.role = 'owner';

    this.members.persist(ownerMember);
    await this.workspaces.save(workspace);

    return ok(workspace);
  }

  /**
   * Returns all active workspaces where the user holds any membership role.
   *
   * @param userId - UUID v7 of the authenticated user.
   * @returns `ok(workspaces)` — always succeeds; returns an empty array when the user
   *          has no memberships.
   */
  async listForUser(userId: string): Promise<Result<Workspace[], AppError>> {
    const list = await this.workspaces.findAllByUserId(userId);
    return ok(list);
  }

  /**
   * Fetches a single workspace by id, scoped to the requesting user's membership.
   *
   * Returns `NOT_FOUND` when the workspace does not exist, is soft-deleted, or
   * the user is not a member (avoids information leakage about non-member workspaces).
   *
   * @param id     - UUID v7 of the workspace.
   * @param userId - UUID v7 of the authenticated user requesting access.
   * @returns `ok(workspace)` or `err(NOT_FOUND)`.
   */
  async getById(id: string, userId: string): Promise<Result<Workspace, AppError>> {
    const workspace = await this.workspaces.findById(id);
    if (!workspace) return err(AppError.notFound('Workspace'));

    const userWorkspaces = await this.workspaces.findAllByUserId(userId);
    const isMember = userWorkspaces.some((w) => w.id === id);
    if (!isMember) return err(AppError.notFound('Workspace'));

    return ok(workspace);
  }

  /** Converts a display name into a lowercase hyphenated slug (max 120 chars). */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }
}
