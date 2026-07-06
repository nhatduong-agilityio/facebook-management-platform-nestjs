import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { uuidv7 } from 'uuidv7';
import { PostMetrics } from '../entities/post-metrics.entity';
import {
  IPostMetricsRepository,
  type MetricsSummary,
  type PostMetricsData,
} from '../ports/post-metrics.repository.port';

/**
 * MikroORM adapter for `IPostMetricsRepository`.
 *
 * `upsert` uses `em.upsert()` on the UNIQUE `(post_id, metric_date)` constraint
 * so that replaying `PostPublishedEvent` for the same post on the same day
 * refreshes the row rather than throwing a unique-constraint violation.
 */
@Injectable()
export class MikroOrmPostMetricsRepository extends IPostMetricsRepository {
  constructor(
    @InjectRepository(PostMetrics)
    private readonly repo: EntityRepository<PostMetrics>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  /** @inheritdoc */
  async upsert(data: PostMetricsData): Promise<void> {
    await this.em.upsert(PostMetrics, {
      id: uuidv7(),
      postId: data.postId,
      workspaceId: data.workspaceId,
      metricDate: data.metricDate,
      reach: data.reach,
      impressions: data.impressions,
      likes: data.likes,
      comments: data.comments,
      shares: data.shares,
      createdAt: new Date(),
    });
  }

  /** @inheritdoc */
  findByPost(postId: string): Promise<PostMetrics[]> {
    return this.repo.find({ postId }, { orderBy: { metricDate: 'ASC' } });
  }

  /** @inheritdoc */
  async aggregateByWorkspace(workspaceId: string): Promise<MetricsSummary> {
    type Row = { reach: string; impressions: string; likes: string; comments: string; shares: string };
    const [row] = await this.em.getConnection().execute<Row[]>(
      `SELECT
         COALESCE(SUM(reach), 0)::int       AS reach,
         COALESCE(SUM(impressions), 0)::int AS impressions,
         COALESCE(SUM(likes), 0)::int       AS likes,
         COALESCE(SUM(comments), 0)::int    AS comments,
         COALESCE(SUM(shares), 0)::int      AS shares
       FROM analytics.post_metrics
       WHERE workspace_id = ?`,
      [workspaceId],
    );
    return {
      reach: Number(row?.reach ?? 0),
      impressions: Number(row?.impressions ?? 0),
      likes: Number(row?.likes ?? 0),
      comments: Number(row?.comments ?? 0),
      shares: Number(row?.shares ?? 0),
    };
  }
}
