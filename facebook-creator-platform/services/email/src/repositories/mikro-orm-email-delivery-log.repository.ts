import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { EmailDeliveryLog } from '../entities/email-delivery-log.entity';
import {
  IEmailDeliveryLogRepository,
  CreateEmailLogInput,
} from '../ports/email-delivery-log.repository.port';

/**
 * MikroORM adapter for `IEmailDeliveryLogRepository`.
 *
 * Duplicate inserts on `dedupe_key` (unique constraint) are swallowed — the
 * existing row is returned, preventing log row duplication on event replay.
 */
@Injectable()
export class MikroOrmEmailDeliveryLogRepository extends IEmailDeliveryLogRepository {
  constructor(
    @InjectRepository(EmailDeliveryLog)
    private readonly repo: EntityRepository<EmailDeliveryLog>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** {@inheritDoc IEmailDeliveryLogRepository.create} */
  async create(input: CreateEmailLogInput): Promise<EmailDeliveryLog> {
    const existing = await this.repo.findOne({ dedupeKey: input.dedupeKey });
    if (existing) return existing;

    const log = this.em.create(EmailDeliveryLog, {
      ...input,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    });
    this.em.persist(log);
    await this.em.flush();
    return log;
  }

  /** {@inheritDoc IEmailDeliveryLogRepository.updateSent} */
  async updateSent(id: string, sentAt: Date): Promise<void> {
    await this.em.nativeUpdate(EmailDeliveryLog, { id }, { status: 'sent', sentAt });
  }

  /** {@inheritDoc IEmailDeliveryLogRepository.updateFailed} */
  async updateFailed(id: string, attempts: number): Promise<void> {
    await this.em.nativeUpdate(EmailDeliveryLog, { id }, { status: 'failed', retryCount: attempts });
  }
}
