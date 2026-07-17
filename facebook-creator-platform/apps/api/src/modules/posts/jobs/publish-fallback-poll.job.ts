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
 * Cron job that polls Facebook to confirm posts stuck in `publishing` state.
 *
 * **Why this job exists**: the happy path relies on a Facebook webhook delivering
 * `feed` change events. If the webhook is delayed or dropped, posts remain in
 * `publishing` indefinitely. This job is the fallback recovery mechanism.
 *
 * **Poll interval**: every 5 minutes (`EVERY_5_MINUTES` cron expression).
 *
 * **Threshold — `PUBLISH_TTL_MINUTES` (default 30 min)**:
 * Facebook's webhook retry cycle runs for approximately 25 minutes at
 * exponentially increasing intervals before giving up. A 30-minute TTL means
 * the job only activates *after* Facebook's full retry window has likely closed,
 * giving the webhook consumer a generous head-start and keeping the race window
 * negligible. Configure via the `PUBLISH_TTL_MINUTES` environment variable.
 *
 * **Race mitigation with the webhook consumer**:
 * The `em.find` query filters by `status = 'publishing'`. If the webhook consumer
 * already committed a `published` transition, the post is absent from the result
 * set — the job never sees it. The 30-minute TTL reinforces this: by the time
 * the job activates, the webhook window is closed. In the unlikely event that
 * both paths transition the same post concurrently, any duplicate
 * `PostPublishedEvent` is deduplicated by consumers via Redis dedup keys
 * (ADR-028/029).
 *
 * **Failure threshold — TTL×3 (default 90 min)**:
 * A post that is still not confirmed after three full poll cycles is unlikely
 * to recover. Marking it `failed` at TTL×3 prevents permanent `publishing` limbo
 * while still tolerating transient Graph API errors across multiple ticks.
 *
 * **Forked `EntityManager`**: each `run()` invocation forks a fresh EM so the
 * cron context is isolated from the NestJS request scope (ADR-030/054).
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
   * Forks a fresh `EntityManager`, then queries for posts in `publishing` state
   * whose `updatedAt` is older than `PUBLISH_TTL_MINUTES` (the cutoff). Posts
   * older than `TTL×3` (the triple cutoff) are moved to `failed`; posts between
   * the two cutoffs are polled against the Graph API and transitioned to
   * `published` if confirmed live, or left for the next tick if not yet visible.
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
