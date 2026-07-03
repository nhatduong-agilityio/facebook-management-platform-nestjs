import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { ref, type Ref } from '@mikro-orm/core';
import { uuidv7 } from 'uuidv7';
import { EncryptedText } from '../../../common/crypto/encrypted-text.type';
import { Workspace } from '../../workspace/entities/workspace.entity';

/**
 * A Facebook Page connected to a workspace.
 *
 * Stored in `core.facebook_accounts`. Does not extend `BaseEntity` because the DDL
 * uses `connected_at` (not `created_at`) and has no `deleted_at` column.
 *
 * BR-F11: `accessToken` is stored AES-256-GCM encrypted and must never be returned
 * by the API or appear in logs.
 *
 * Relationships:
 * - `workspace` (`@ManyToOne`) — the workspace that owns this page connection.
 *   Same `core` schema, so a real FK constraint is used.
 */
@Entity({ tableName: 'facebook_accounts', schema: 'core' })
@Unique({ properties: ['pageId'] })
export class FacebookAccount {
  /** Application-generated UUID v7 primary key (ADR-013). No DB DEFAULT. */
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  /**
   * Owning workspace. Managed as a `@ManyToOne` (same schema — real FK allowed).
   * Indexed for per-workspace page lookups (BR-R08).
   */
  @ManyToOne({ entity: () => Workspace, index: true })
  workspace!: Ref<Workspace>;

  /** Facebook Page ID (external identifier from the Graph API). Globally unique. */
  @Property({ length: 255 })
  pageId!: string;

  /** Display name of the Facebook Page at connection time. */
  @Property({ length: 255 })
  pageName!: string;

  /**
   * Long-lived Page access token, stored AES-256-GCM encrypted (BR-F11).
   * Never SELECT-ed for API responses; decrypted only by the Graph API adapter.
   */
  @Property({ type: EncryptedText })
  accessToken!: string;

  /** When the access token expires. `null` means the token has no expiry. */
  @Property({ type: 'timestamptz', nullable: true })
  tokenExpiresAt?: Date;

  /** When this Page was first connected to the workspace. */
  @Property({ type: 'timestamptz' })
  connectedAt: Date = new Date();

  /** Last time any field on this record was updated. */
  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  /**
   * Set when the Page deauthorizes our app (T2.7). `null` means the account is active.
   * Queries must filter `{ deletedAt: null }` explicitly — this entity has no `@Filter`.
   */
  @Property({ type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  // ---------------------------------------------------------------------------
  // Factory helpers — keep `ref()` and `em.getReference()` out of service code
  // (services may not import @mikro-orm/core per §14).
  // ---------------------------------------------------------------------------

  /**
   * Creates a new `FacebookAccount` for the given workspace and page.
   *
   * @param workspaceProxy - A loaded or proxy `Workspace` instance (e.g. from `em.getReference`).
   * @param pageId         - Facebook Page ID from the Graph API.
   * @param pageName       - Facebook Page display name.
   * @param accessToken    - Plaintext page access token (will be encrypted on persist).
   * @param tokenExpiresAt - Token expiry date, or `null` if the token has no expiry.
   */
  static connect(
    workspaceProxy: Workspace,
    pageId: string,
    pageName: string,
    accessToken: string,
    tokenExpiresAt: Date | null,
  ): FacebookAccount {
    const account = new FacebookAccount();
    account.workspace = ref(workspaceProxy);
    account.pageId = pageId;
    account.pageName = pageName;
    account.accessToken = accessToken;
    if (tokenExpiresAt) account.tokenExpiresAt = tokenExpiresAt;
    return account;
  }

  /**
   * Refreshes the access token on an existing record.
   *
   * @param accessToken    - New plaintext page access token.
   * @param tokenExpiresAt - New expiry date, or `null` if the token has no expiry.
   */
  updateToken(accessToken: string, tokenExpiresAt: Date | null): void {
    this.accessToken = accessToken;
    this.tokenExpiresAt = tokenExpiresAt ?? undefined;
  }
}
