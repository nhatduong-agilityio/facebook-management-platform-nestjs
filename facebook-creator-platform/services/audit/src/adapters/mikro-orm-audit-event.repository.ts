import { Injectable } from '@nestjs/common';
import { EntityManager, FilterQuery } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import { AuditEvent } from '../entities/audit-event.entity';
import {
  IAuditEventRepository,
  InsertAuditEventData,
  FindByWorkspaceOptions,
} from '../ports/audit-event.repository.port';

/** MongoDB duplicate-key error code. */
const MONGO_DUPLICATE_KEY = 11000;

/**
 * MikroORM MongoDB implementation of `IAuditEventRepository`.
 *
 * The `insert` method catches duplicate-key errors (code 11000) and discards them —
 * this is the idempotency mechanism for the audit consumer (ADR-064).
 */
@Injectable()
export class MikroOrmAuditEventRepository extends IAuditEventRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /**
   * Persists one audit document, silently dropping duplicates.
   *
   * @param data - Fields for the new document.
   */
  async insert(data: InsertAuditEventData): Promise<void> {
    try {
      const doc = this.em.create(AuditEvent, {
        _id: uuidv7(),
        eventId: data.eventId,
        routingKey: data.routingKey,
        workspaceId: data.workspaceId,
        payload: data.payload,
        receivedAt: new Date(),
      });
      this.em.persist(doc);
      await this.em.flush();
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) return;
      throw err;
    }
  }

  /**
   * Returns audit documents for a workspace, newest first.
   *
   * @param workspaceId - UUID of the workspace.
   * @param opts        - Pagination options.
   */
  async findByWorkspace(
    workspaceId: string,
    opts: FindByWorkspaceOptions = {},
  ): Promise<AuditEvent[]> {
    const { limit = 50, before } = opts;
    const where: FilterQuery<AuditEvent> = before
      ? { workspaceId, receivedAt: { $lt: before } }
      : { workspaceId };
    return this.em.find(AuditEvent, where, {
      orderBy: { receivedAt: 'DESC' },
      limit,
    });
  }

  /**
   * Finds a single audit document by `_id`.
   *
   * @param id - Document `_id` (UUID v7).
   */
  async findById(id: string): Promise<AuditEvent | null> {
    return this.em.findOne(AuditEvent, id as FilterQuery<AuditEvent>);
  }
}

/** Type guard for MongoDB duplicate-key errors. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === MONGO_DUPLICATE_KEY
  );
}
