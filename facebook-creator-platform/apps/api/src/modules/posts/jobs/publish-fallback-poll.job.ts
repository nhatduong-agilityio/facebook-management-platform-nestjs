import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Post } from '../entities/post.entity';
import { FacebookAccount } from '../../facebook/entities/facebook-account.entity';
import { IFacebookGraphApiProvider } from '../../facebook/ports/facebook-graph-api.provider.port';
import { IEventBus } from '../../../common/events/event-bus.port';
import { PostPublishedEvent } from '../events/post-published.event';
import { PostFailedEvent } from '../events/post-failed.event';

/** Cron expression: every 5 minutes (at seconds 0, minute divisible by 5). */
const EVERY_5_MINUTES = '0 */5 * * * *';

/**
 * Cron job that polls Facebook to confirm posts in `publishing` state.
 *
 * Runs every 5 minutes. Finds posts with `status='publishing'` and
 * `updatedAt <= now() - PUBLISH_TTL_MINUTES` (default 30 min), then calls
 * `GET /{facebookGraphPostId}` on the Graph API:
 * - post is live → `publishing→published` + emits `PostPublishedEvent`
 * - post not live and within TTL×3 → no change (will be re-checked next tick)
 * - post not live and beyond TTL×3 → `failed` + emits `PostFailedEvent`
 *
 * Uses a forked `EntityManager` per run (ADR-030 — non-request context).
 */
@Injectable()
export class PublishFallbackPollJob {
  private readonly ttlMinutes: number;

  constructor(
    private readonly orm: MikroORM,
    private readonly graphApi: IFacebookGraphApiProvider,
    private readonly eventBus: IEventBus,
    config: ConfigService,
    private readonly logger: Logger,
  ) {
    this.ttlMinutes = config.get<number>('PUBLISH_TTL_MINUTES', 30);
  }

  /**
   * Entry point called by `@nestjs/schedule` every 5 minutes.
   *
   * Forks a fresh `EntityManager` for isolation.
   */
  @Cron(EVERY_5_MINUTES)
  async run(): Promise<void> {
    const em = this.orm.em.fork();
    const now = new Date();
    const ttlMs = this.ttlMinutes * 60 * 1000;
    const cutoff = new Date(now.getTime() - ttlMs);
    const tripleCutoff = new Date(now.getTime() - ttlMs * 3);

    const posts = await em.find(
      Post,
      { status: 'publishing', updatedAt: { $lte: cutoff }, deletedAt: null },
      { populate: ['facebookAccount'] },
    );

    if (posts.length === 0) return;

    this.logger.log(
      { count: posts.length, ttlMinutes: this.ttlMinutes },
      'PublishFallbackPollJob: polling publishing posts',
    );

    for (const post of posts) {
      await this.pollPost(em, post, tripleCutoff);
    }
  }

  /**
   * Polls a single `publishing` post and transitions it based on Graph API response.
   *
   * @param em           - Forked EntityManager for this job run.
   * @param post         - The `publishing` post to poll (facebookAccount populated).
   * @param tripleCutoff - TTL×3 threshold; posts older than this are failed immediately.
   */
  private async pollPost(
    em: ReturnType<MikroORM['em']['fork']>,
    post: Post,
    tripleCutoff: Date,
  ): Promise<void> {
    if (!post.facebookGraphPostId) {
      this.logger.error(
        { postId: post.id },
        'PublishFallbackPollJob: publishing post has no facebookGraphPostId; skipping',
      );
      return;
    }

    const account = post.facebookAccount?.getEntity() as FacebookAccount | undefined;
    if (!account) {
      this.logger.error(
        { postId: post.id },
        'PublishFallbackPollJob: publishing post has no facebookAccount; skipping',
      );
      return;
    }

    try {
      const live = await this.graphApi.checkPostLive(
        post.facebookGraphPostId,
        account.accessToken,
      );

      if (live) {
        post.status = 'published';
        post.publishedAt = new Date();
        await em.flush();
        this.logger.log(
          { postId: post.id, graphPostId: post.facebookGraphPostId },
          'PublishFallbackPollJob: post confirmed live',
        );
        await this.eventBus.publish(
          new PostPublishedEvent(
            post.id,
            post.workspace.id,
            post.facebookGraphPostId,
            account.id,
            post.createdByUserId,
          ),
        );
        return;
      }

      // Not live yet — check if we've exceeded TTL×3
      if (post.updatedAt <= tripleCutoff) {
        const error = `Post not confirmed live after ${this.ttlMinutes * 3} minutes`;
        post.status = 'failed';
        post.lastError = error;
        await em.flush();
        this.logger.error(
          { postId: post.id, graphPostId: post.facebookGraphPostId },
          'PublishFallbackPollJob: TTL×3 exceeded, marking failed',
        );
        await this.eventBus.publish(
          new PostFailedEvent(post.id, post.workspace.id, post.createdByUserId, error),
        );
      }
    } catch (err) {
      this.logger.error(
        { postId: post.id, err },
        'PublishFallbackPollJob: Graph API check failed; will retry next tick',
      );
    }
  }
}
