import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Invitation } from '../entities/invitation.entity';
import { IInvitationRepository } from '../ports/invitation.repository.port';

/**
 * MikroORM adapter for `IInvitationRepository`.
 *
 * Filters on `workspace` use the `@ManyToOne` relation property — MikroORM
 * translates `{ workspace: workspaceId }` to `WHERE workspace_id = ?`.
 */
@Injectable()
export class MikroOrmInvitationRepository extends IInvitationRepository {
  constructor(
    @InjectRepository(Invitation) private readonly repo: EntityRepository<Invitation>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  async save(invitation: Invitation): Promise<void> {
    this.em.persist(invitation);
    await this.em.flush();
  }

  /** @inheritdoc */
  findPendingByWorkspaceAndEmail(workspaceId: string, email: string): Promise<Invitation | null> {
    return this.repo.findOne({ workspace: workspaceId, email, status: 'pending' });
  }

  /** @inheritdoc */
  findById(id: string): Promise<Invitation | null> {
    return this.repo.findOne({ id });
  }

  /** @inheritdoc */
  findByToken(token: string): Promise<Invitation | null> {
    return this.repo.findOne({ token });
  }
}
