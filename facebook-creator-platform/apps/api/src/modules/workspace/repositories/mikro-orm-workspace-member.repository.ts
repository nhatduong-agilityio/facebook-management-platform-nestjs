import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository, type FilterQuery } from '@mikro-orm/core';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import {
  IWorkspaceMemberRepository,
  type ListMembersCursor,
  type ListMembersQuery,
  type MembersPage,
} from '../ports/workspace-member.repository.port';

/**
 * MikroORM adapter for `IWorkspaceMemberRepository`.
 *
 * Filters on `workspace` use the `@ManyToOne` relation property directly —
 * MikroORM translates `{ workspace: workspaceId }` to `WHERE workspace_id = ?`.
 */
@Injectable()
export class MikroOrmWorkspaceMemberRepository extends IWorkspaceMemberRepository {
  constructor(
    @InjectRepository(WorkspaceMember) private readonly repo: EntityRepository<WorkspaceMember>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  persist(member: WorkspaceMember): void {
    this.em.persist(member);
  }

  /** @inheritdoc */
  findByWorkspaceAndId(workspaceId: string, memberId: string): Promise<WorkspaceMember | null> {
    return this.repo.findOne({ workspace: workspaceId, id: memberId });
  }

  /** @inheritdoc */
  countOwners(workspaceId: string): Promise<number> {
    return this.repo.count({ workspace: workspaceId, role: 'owner' });
  }

  /** @inheritdoc */
  async findAllByWorkspaceId(workspaceId: string, query: ListMembersQuery = {}): Promise<MembersPage> {
    const limit = Math.min(query.limit ?? 50, 100);
    const where: FilterQuery<WorkspaceMember> = { workspace: workspaceId };

    if (query.cursor) {
      const raw = Buffer.from(query.cursor, 'base64url').toString('utf8');
      const { joinedAt, id } = JSON.parse(raw) as ListMembersCursor;
      const cursorDate = new Date(joinedAt);
      // Keyset: rows strictly after (joinedAt ASC, id ASC) of the cursor row.
      where.$or = [
        { joinedAt: { $gt: cursorDate } },
        { joinedAt: cursorDate, id: { $gt: id } },
      ];
    }

    const rows = await this.repo.find(where, {
      orderBy: { joinedAt: 'ASC', id: 'ASC' },
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ joinedAt: last.joinedAt.toISOString(), id: last.id }),
          ).toString('base64url')
        : null;

    return { data, nextCursor };
  }

  /** @inheritdoc */
  async remove(member: WorkspaceMember): Promise<void> {
    this.em.remove(member);
    await this.em.flush();
  }

  /** @inheritdoc */
  findByWorkspaceAndUserId(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    return this.repo.findOne({ workspace: workspaceId, userId });
  }

  /** @inheritdoc */
  async save(member: WorkspaceMember): Promise<void> {
    this.em.persist(member);
    await this.em.flush();
  }
}
