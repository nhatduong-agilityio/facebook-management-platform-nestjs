import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { FacebookAccount } from '../entities/facebook-account.entity';
import { IEventBus } from '../../../common/events/event-bus.port';
import { FacebookTokenExpiringEvent } from '../events/facebook-token-expiring.event';

/** Advance warning window — emit the event this many days before expiry. */
const WARNING_DAYS = 7;

/**
 * Daily cron job that detects Facebook Page access tokens expiring within 7 days.
 *
 * Runs at midnight UTC. Finds all non-deleted `facebook_accounts` with
 * `tokenExpiresAt < now() + 7 days` and emits `FacebookTokenExpiringEvent` for each
 * (ADR-053). The Email Service (T4.3) consumes the event and sends the renewal reminder.
 *
 * Token values are never included in the event payload (BR-F11). No PII is emitted.
 * Uses a forked `EntityManager` per run (ADR-030 — non-request context).
 */
@Injectable()
export class FacebookTokenExpiryScheduler {
  constructor(
    private readonly orm: MikroORM,
    private readonly eventBus: IEventBus,
    private readonly logger: Logger,
  ) {}

  /**
   * Entry point called by `@nestjs/schedule` daily at midnight UTC.
   *
   * Forks a fresh `EntityManager` and queries accounts with expiring tokens.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run(): Promise<void> {
    const em = this.orm.em.fork();
    const cutoff = new Date(Date.now() + WARNING_DAYS * 24 * 60 * 60 * 1000);

    const accounts = await em.find(
      FacebookAccount,
      { tokenExpiresAt: { $lte: cutoff }, deletedAt: null },
      { populate: ['workspace'] },
    );

    if (accounts.length === 0) {
      this.logger.log('FacebookTokenExpiryScheduler: no near-expiry tokens found');
      return;
    }

    this.logger.log(
      { count: accounts.length },
      'FacebookTokenExpiryScheduler: emitting token-expiring events',
    );

    for (const account of accounts) {
      await this.eventBus.publish(
        new FacebookTokenExpiringEvent(
          account.id,
          account.workspace.id,
          account.pageId,
          account.tokenExpiresAt!,
        ),
      );
    }
  }
}
