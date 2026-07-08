import type { User } from '../entities/user.entity';

/**
 * Port (outbound): contract the application layer requires for persisting and
 * querying User aggregates.
 *
 * The concrete adapter (`MikroOrmUserRepository`) lives in the infrastructure
 * layer and is swapped in via NestJS DI, keeping the service free of ORM imports.
 */
export abstract class IUserRepository {
  /**
   * Finds an active user by their Clerk identity.
   *
   * @param clerkUserId - The `sub` claim from a Clerk-issued JWT.
   * @returns The matching `User`, or `null` when no record exists.
   */
  abstract findByClerkId(clerkUserId: string): Promise<User | null>;

  /**
   * Persists a newly constructed `User` aggregate to the store.
   *
   * Callers are responsible for constructing the entity with all required
   * fields set before passing it here. Throws on infrastructure failure.
   *
   * @param user - The `User` instance to save.
   */
  abstract save(user: User): Promise<void>;

  /**
   * Finds a user by their internal platform id.
   *
   * Used by internal endpoints that need to resolve an email from a UUID
   * carried in domain events (e.g. `createdByUserId` in `PostPublishedEvent`).
   *
   * @param id - UUID v7 of the `User` record.
   * @returns The matching `User`, or `null` when no record exists.
   */
  abstract findById(id: string): Promise<User | null>;
}
