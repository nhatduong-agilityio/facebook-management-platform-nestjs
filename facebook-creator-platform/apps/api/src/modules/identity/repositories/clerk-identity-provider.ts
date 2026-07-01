import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';
import { IIdentityProvider } from '../ports/identity-provider.port';
import type { ExternalUserProfile } from '../ports/identity-provider.port';

/**
 * Clerk adapter for `IIdentityProvider`.
 *
 * All `@clerk/backend` imports are confined to this class. The SDK client is
 * created once at module startup. No Clerk type leaks past this boundary.
 */
@Injectable()
export class ClerkIdentityProvider extends IIdentityProvider {
  private readonly client: ClerkClient;

  constructor(private readonly config: ConfigService) {
    super();
    this.client = createClerkClient({
      secretKey: this.config.getOrThrow<string>('CLERK_SECRET_KEY'),
    });
  }

  /** @inheritdoc */
  async getProfile(providerUserId: string): Promise<ExternalUserProfile> {
    const user = await this.client.users.getUser(providerUserId);
    return {
      email: user.emailAddresses[0]?.emailAddress ?? '',
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      avatarUrl: user.imageUrl || undefined,
    };
  }
}
