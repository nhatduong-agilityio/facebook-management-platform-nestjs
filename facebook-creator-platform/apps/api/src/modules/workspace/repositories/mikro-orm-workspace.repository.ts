import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository, type FilterQuery } from '@mikro-orm/core';
import { Workspace } from '../entities/workspace.entity';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import {
  IWorkspaceRepository,
  type ListWorkspacesCursor,
  type ListWorkspacesQuery,
  type WorkspacesPage,
} from '../ports/workspace.repository.port';

/**
 * MikroORM adapter for `IWorkspaceRepository`.
 *
 * All ORM-specific imports are confined here. The application layer (service)
 * depends only on the `IWorkspaceRepository` port.
 */
@Injectable()
export class MikroOrmWorkspaceRepository extends IWorkspaceRepository {
  constructor(
    @InjectRepository(Workspace) private readonly repo: EntityRepository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly memberRepo: EntityRepository<WorkspaceMember>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  findById(id: string): Promise<Workspace | null> {
    return this.repo.findOne({ id });
  }

  /**
   * Returns a page of active workspaces the user belongs to, ordered `createdAt DESC, id DESC`
   * (keyset pagination — §12).
   *
   * Two typed repository queries: first resolve all workspace IDs via `workspace_members`
   * (the user's membership set is bounded), then load the matching `Workspace` rows with
   * the cursor filter applied. The `softDelete` filter on `BaseEntity` excludes deleted workspaces.
   *
   * @inheritdoc
   */
  async findAllByUserId(userId: string, query: ListWorkspacesQuery = {}): Promise<WorkspacesPage> {
    const limit = Math.min(query.limit ?? 50, 100);

    const memberships = await this.memberRepo.find({ userId }, { fields: ['workspace'] });
    if (memberships.length === 0) return { data: [], nextCursor: null };

    const workspaceIds = memberships.map((m) => m.workspace.id);
    const where: FilterQuery<Workspace> = { id: { $in: workspaceIds } };

    if (query.cursor) {
      const raw = Buffer.from(query.cursor, 'base64url').toString('utf8');
      const { createdAt, id } = JSON.parse(raw) as ListWorkspacesCursor;
      const cursorDate = new Date(createdAt);
      // Keyset: rows strictly before (createdAt DESC, id DESC) of the cursor row.
      where.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, id: { $lt: id } },
      ];
    }

    const rows = await this.repo.find(where, {
      orderBy: { createdAt: 'DESC', id: 'DESC' },
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
          ).toString('base64url')
        : null;

    return { data, nextCursor };
  }

  /** @inheritdoc */
  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo.count({ slug });
    return count > 0;
  }

  /**
   * Stages the workspace for insertion and flushes the Unit of Work.
   *
   * Uses a dedicated `flush` to commit the workspace + its owner membership
   * in one transaction. The caller is responsible for calling
   * `IWorkspaceMemberRepository.persist` before this method.
   *
   * @inheritdoc
   */
  async save(workspace: Workspace): Promise<void> {
    this.em.persist(workspace);
    await this.em.flush();
  }
}
