import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../../common/guards/internal-secret.guard';
import { IFacebookAccountRepository } from './ports/facebook-account.repository.port';

/**
 * Internal HTTP endpoints for cross-service data resolution (ADR-050).
 *
 * **Not** Swagger-documented. **Not** Clerk-authenticated.
 * Protected only by `InternalSecretGuard` (`x-internal-secret` header).
 *
 * Consumed by `services/analytics` to resolve a decrypted Facebook page token
 * from a `facebookAccountId` carried in `PostPublishedEvent` (ADR-049).
 */
@Controller('internal/facebook-accounts')
@UseGuards(InternalSecretGuard)
export class InternalFacebookController {
  /** @param accounts - Repository for `FacebookAccount` lookups. */
  constructor(private readonly accounts: IFacebookAccountRepository) {}

  /**
   * Returns the decrypted page access token for the given Facebook account.
   *
   * `account.accessToken` is stored AES-256-GCM encrypted; MikroORM's
   * `EncryptedText` custom type decrypts it on load, so the field is already
   * plaintext by the time we access it here.
   *
   * @param id - UUID v7 of the `FacebookAccount` record.
   * @returns `{ id, pageToken }` — 404 if the account does not exist.
   */
  @Get(':id')
  async getAccount(@Param('id') id: string): Promise<{ id: string; pageToken: string }> {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundException(`FacebookAccount ${id} not found`);
    return { id: account.id, pageToken: account.accessToken };
  }
}
