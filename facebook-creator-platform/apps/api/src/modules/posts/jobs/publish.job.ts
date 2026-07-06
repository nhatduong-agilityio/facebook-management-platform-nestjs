import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Post } from '../entities/post.entity';
import { FacebookAccount } from '../../facebook/entities/facebook-account.entity';
import { IFacebookGraphApiProvider } from '../../facebook/ports/facebook-graph-api.provider.port';
import { IEventBus } from '../../../common/events/event-bus.port';
import { PostFailedEvent } from '../events/post-failed.event';

/**
 * Cron job that publishes scheduled posts to Facebook.
 *
 * Runs every minute. Finds posts with `status='scheduled'` and `scheduledAt <= now()`,
 * calls `POST /{pageId}/feed` on the Graph API, then transitions:
 * - success → `publishing` (stores `facebookGraphPostId`)
 * - failure → `failed` (stores `lastError`) + emits `PostFailedEvent`
 *
 * Uses a forked `EntityManager` per run (ADR-030 — non-request context).
 * Each post is flushed individually so a single Graph API error does not block others.
 */
@Injectable()
export class PublishJob {
  constructor(
    private readonly orm: MikroORM,
    private readonly graphApi: IFacebookGraphApiProvider,
    private readonly eventBus: IEventBus,
    private readonly logger: Logger,
  ) {}

  /**
   * Entry point called by `@nestjs/schedule` once per minute.
   *
   * Forks a fresh `EntityManager` for isolation — never shares the request-scoped EM.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    const em = this.orm.em.fork();
    const now = new Date();

    const posts = await em.find(
      Post,
      { status: 'scheduled', scheduledAt: { $lte: now }, deletedAt: null },
      { populate: ['facebookAccount'] },
    );

    if (posts.length === 0) return;

    this.logger.log({ count: posts.length }, 'PublishJob: processing due posts');

    for (const post of posts) {
      await this.processPost(em, post);
    }
  }

  /**
   * Attempts to publish a single post, flushing after each outcome so failures
   * are isolated from other posts in the same cron tick.
   *
   * @param em   - Forked EntityManager for this job run.
   * @param post - The `scheduled` post to publish (facebookAccount populated).
   */
  private async processPost(
    em: ReturnType<MikroORM['em']['fork']>,
    post: Post,
  ): Promise<void> {
    const account = post.facebookAccount?.getEntity() as FacebookAccount | undefined;

    if (!account) {
      post.status = 'failed';
      post.lastError = 'No Facebook account linked to this post';
      await em.flush();
      await this.eventBus.publish(
        new PostFailedEvent(post.id, post.workspace.id, post.createdByUserId, post.lastError),
      );
      return;
    }

    try {
      const result = await this.graphApi.publishPost(
        account.pageId,
        account.accessToken,
        post.content,
        post.mediaUrl,
      );
      post.facebookGraphPostId = result.postId;
      post.status = 'publishing';
      await em.flush();
      this.logger.log(
        { postId: post.id, graphPostId: result.postId },
        'PublishJob: post submitted to Graph API',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Graph API error';
      post.status = 'failed';
      post.lastError = message;
      await em.flush();
      this.logger.error({ postId: post.id, err: message }, 'PublishJob: Graph API call failed');
      await this.eventBus.publish(
        new PostFailedEvent(post.id, post.workspace.id, post.createdByUserId, message),
      );
    }
  }
}
