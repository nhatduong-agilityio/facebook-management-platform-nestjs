import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy';
import type { Opt } from '@mikro-orm/core';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Lifecycle state of a user account.
 * - `active`   — normal access, can log in and perform all role-permitted operations.
 * - `inactive` — account suspended; login is denied at the Clerk guard level.
 */
export type UserStatus = 'active' | 'inactive';

/**
 * Platform user record, synchronised from Clerk on first sign-in.
 *
 * Stored in the `core.users` table. Authentication is handled entirely by Clerk;
 * this entity exists so that workspace memberships, RBAC roles, and audit trails
 * can reference a stable internal id rather than the Clerk user id.
 *
 * PII fields (`email`, `fullName`) are never logged — they are covered by Pino's
 * redact paths in AppModule.
 */
@Entity({ tableName: 'users', schema: 'core' })
export class User extends BaseEntity {
  /** Clerk's own user identifier, used to look up or create this record on sign-in. */
  @Property({ length: 255 })
  @Unique()
  clerkUserId!: string;

  /** Primary email address sourced from Clerk. Never logged or included in event payloads. */
  @Property({ length: 255 })
  @Unique()
  @Index()
  email!: string;

  /** Display name sourced from Clerk. Optional; never logged. */
  @Property({ length: 100, nullable: true })
  fullName?: string;

  /** URL of the user's avatar image sourced from Clerk. Optional. */
  @Property({ length: 2048, nullable: true })
  avatarUrl?: string;

  /** Current lifecycle state of the account. Defaults to `active` on creation. */
  @Property({ length: 15, default: 'active' })
  status: UserStatus & Opt = 'active';
}
