import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../../common/guards/internal-secret.guard';
import { IUserRepository } from './ports/user.repository.port';

/**
 * Internal HTTP endpoint for user email resolution (ADR-050).
 *
 * **Not** Swagger-documented. **Not** Clerk-authenticated.
 * Protected only by `InternalSecretGuard` (`x-internal-secret` header).
 *
 * Consumed by `services/email` to resolve the recipient email from a
 * `userId` / `createdByUserId` UUID carried in domain event payloads.
 */
@Controller('internal/users')
@UseGuards(InternalSecretGuard)
export class InternalUserController {
  /** @param users - Repository for `User` lookups. */
  constructor(private readonly users: IUserRepository) {}

  /**
   * Returns the email address for the given user id.
   *
   * @param id - UUID v7 of the `User` record.
   * @returns `{ id, email }` — 404 if the user does not exist.
   */
  @Get(':id')
  async getUser(@Param('id') id: string): Promise<{ id: string; email: string }> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return { id: user.id, email: user.email };
  }
}
