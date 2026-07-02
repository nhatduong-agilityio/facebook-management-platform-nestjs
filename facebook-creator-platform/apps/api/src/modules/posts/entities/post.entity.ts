import { type Opt, ref, type Ref } from '@mikro-orm/core';
import { Entity, Index, ManyToOne, Property } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { FacebookAccount } from '../../facebook/entities/facebook-account.entity';

/**
 * Lifecycle status of a Facebook post managed by the platform.
 *
 * - `draft`      — being authored; not yet queued for publishing.
 * - `scheduled`  — queued; `scheduledAt` must be a future datetime (BR-F06).
 * - `publishing` — Publish Job has submitted to Graph API and captured `facebookGraphPostId`.
 * - `published`  — final success; confirmed by Facebook webhook (T2.7) or fallback poll.
 * - `failed`     — terminal failure; `lastError` contains the Graph API error message.
 */
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

/** Data required to create a new post via `Post.create()`. */
export interface CreatePostData {
  /** Optional display title (max 255 chars). */
  title?: string;
  /** Post body text; must be 1–63,206 characters (BR-F02). */
  content: string;
  /** Optional media URL (max 2,048 characters). */
  mediaUrl?: string;
  /** When to publish; required when transitioning to `scheduled` (BR-F06). */
  scheduledAt?: Date;
}

/**
 * A Facebook post managed by the platform.
 *
 * Stored in `core.posts`. Extends `BaseEntity` for uuid v7 PK, timestamps, and
 * soft-delete (`deletedAt`). Soft-deleted posts are hidden by the default
 * `softDelete` MikroORM filter.
 *
 * Relationships (same schema — real FK + index):
 * - `workspace`       — owning workspace (non-nullable).
 * - `facebookAccount` — target Page connection; nullable until publishing.
 *
 * `createdByUserId` is a logical FK to `identity.users` (cross-module — BR-R06).
 * No ORM relation; integrity is enforced at the domain layer.
 *
 * `facebookGraphPostId` is set synchronously by the Publish Job when the Graph
 * API responds with a post id; drives the `publishing → published` transition in T2.7.
 */
@Entity({ tableName: 'posts', schema: 'core' })
export class Post extends BaseEntity {
  /** Owning workspace. Real FK to `core.workspaces.id`. */
  @ManyToOne({ entity: () => Workspace, index: true })
  workspace!: Ref<Workspace>;

  /**
   * Target Facebook Page connection. Nullable until the post is linked to a Page.
   * Real FK to `core.facebook_accounts.id`.
   */
  @ManyToOne({ entity: () => FacebookAccount, nullable: true, index: true })
  facebookAccount?: Ref<FacebookAccount>;

  /**
   * UUID of the `core.users` record that created this post.
   * Logical FK — cross-module (BR-R06). Indexed for user-timeline queries.
   */
  @Property({ type: 'uuid' })
  @Index()
  createdByUserId!: string;

  /** Optional display title (max 255 characters). */
  @Property({ length: 255, nullable: true })
  title?: string;

  /**
   * Post body text (1–63,206 characters — BR-F02).
   * Validated in the DTO layer and enforced by a DB CHECK constraint.
   */
  @Property({ columnType: 'text' })
  content!: string;

  /** Optional media attachment URL (max 2,048 characters). */
  @Property({ length: 2048, nullable: true })
  mediaUrl?: string;

  /**
   * Current lifecycle state. Default is `draft`.
   * Valid transitions are enforced by `PostsService` (T2.5).
   */
  @Property({ length: 15, default: 'draft' })
  @Index()
  status: PostStatus & Opt = 'draft';

  /**
   * Facebook Graph API post id captured synchronously when the Publish Job
   * submits the post and receives a 200 response (sets status → `publishing`).
   * Used to match incoming webhook events (T2.7) and drive `publishing → published`.
   */
  @Property({ length: 255, nullable: true })
  facebookGraphPostId?: string;

  /** When to publish; must be a future datetime when status is `scheduled` (BR-F06). */
  @Property({ type: 'timestamptz', nullable: true })
  scheduledAt?: Date;

  /** Set by the Publish Job when the Graph API confirms the post is live. */
  @Property({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  /** Last Graph API error message; set on `failed` transition. */
  @Property({ columnType: 'text', nullable: true })
  lastError?: string;

  /**
   * Factory that creates a new `Post` in `draft` status.
   *
   * `workspaceProxy` and `facebookAccountProxy` must be obtained via
   * `em.getReference()` in the repository adapter — never load the full entity
   * just to set a FK (§14).
   *
   * @param workspaceProxy       - Proxy reference to the owning workspace.
   * @param facebookAccountProxy - Proxy reference to the target Page, or `null`.
   * @param createdByUserId      - UUID of the creating user (logical FK — BR-R06).
   * @param data                 - Post fields (content required; others optional).
   * @returns Unsaved `Post` instance; call `em.persist(post)` + `em.flush()`.
   */
  static create(
    workspaceProxy: Workspace,
    facebookAccountProxy: FacebookAccount | null,
    createdByUserId: string,
    data: CreatePostData,
  ): Post {
    const post = new Post();
    post.workspace = ref(workspaceProxy);
    if (facebookAccountProxy) {
      post.facebookAccount = ref(facebookAccountProxy);
    }
    post.createdByUserId = createdByUserId;
    post.title = data.title;
    post.content = data.content;
    post.mediaUrl = data.mediaUrl;
    post.scheduledAt = data.scheduledAt;
    return post;
  }
}
