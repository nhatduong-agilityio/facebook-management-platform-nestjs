import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Webhook } from 'svix';
import type { UserWebhookEvent } from '@clerk/backend';
import { User } from '../entities/user.entity';
import { IUserRepository } from '../ports/user.repository.port';

/**
 * The three Standard Webhooks signature headers that Clerk forwards with every event.
 *
 * Property names here are framework-neutral (`id`, `timestamp`, `signature`).
 * The actual HTTP header names (`svix-id`, `svix-timestamp`, `svix-signature`) are
 * defined by the Standard Webhooks specification (standardwebhooks.com) and appear
 * only at the controller boundary where they are read from the request, and inside
 * `verifyAndParse` where they are forwarded to `verifyWebhook`.
 */
export interface ClerkWebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

type UserUpsertData = Extract<UserWebhookEvent, { type: 'user.created' | 'user.updated' }>['data'];
type UserDeleteData = Extract<UserWebhookEvent, { type: 'user.deleted' }>['data'];

/**
 * Infrastructure service that verifies Clerk webhook signatures and applies
 * user lifecycle changes to the local `core.users` table.
 *
 * **Event handling:**
 * - `user.created` / `user.updated` → upsert email, name, and avatar (no status change).
 * - `user.deleted` → soft-delete the local record; idempotent if already deleted.
 *
 * Signature verification uses `svix`'s `Webhook.verify` with the
 * `CLERK_WEBHOOK_SIGNING_SECRET` environment variable. Requests that fail
 * verification throw `BadRequestException` so NestJS returns HTTP 400.
 */
@Injectable()
export class ClerkWebhookService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifies the webhook signature, parses the event, and dispatches to the
   * appropriate handler.
   *
   * @param rawBody - The raw request body buffer (must be unmodified by JSON parser).
   * @param webhookHeaders - The three Standard Webhooks signature headers from the request.
   */
  async handleEvent(rawBody: Buffer, webhookHeaders: ClerkWebhookHeaders): Promise<void> {
    const event = this.verifyAndParse(rawBody, webhookHeaders);

    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await this.syncUser(event.data as UserUpsertData);
        break;
      case 'user.deleted':
        await this.softDeleteUser(event.data as UserDeleteData);
        break;
    }
  }

  /**
   * Verifies the Clerk webhook signature synchronously and returns the parsed event.
   *
   * Uses `svix`'s `Webhook.verify` directly — the most straightforward approach for
   * Express-based servers where the raw body is already available as a `Buffer`.
   *
   * @throws `BadRequestException` when the signature is invalid or the body has been tampered with.
   */
  private verifyAndParse(rawBody: Buffer, headers: ClerkWebhookHeaders): UserWebhookEvent {
    const secret = this.config.getOrThrow<string>('CLERK_WEBHOOK_SIGNING_SECRET');

    const wh = new Webhook(secret);
    try {
      return wh.verify(rawBody.toString(), {
        'svix-id': headers.id,
        'svix-timestamp': headers.timestamp,
        'svix-signature': headers.signature,
      }) as UserWebhookEvent;
    } catch {
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  /**
   * Creates or updates the local `User` record from Clerk's user payload.
   * Does not touch `status` — that field is managed via internal admin operations.
   */
  private async syncUser(data: UserUpsertData): Promise<void> {
    const primaryEmail =
      data.email_addresses.find((e) => e.id === data.primary_email_address_id)?.email_address ??
      data.email_addresses[0]?.email_address ??
      '';

    const nameParts = [data.first_name, data.last_name].filter(Boolean);

    let user = await this.userRepository.findByClerkId(data.id);
    if (!user) {
      user = new User();
      user.clerkUserId = data.id;
    }

    user.email = primaryEmail;
    user.fullName = nameParts.length > 0 ? nameParts.join(' ') : undefined;
    user.avatarUrl = data.image_url || undefined;

    await this.userRepository.save(user);
  }

  /**
   * Soft-deletes the local user record. Idempotent — returns without error
   * when the user was already deleted or was never provisioned locally.
   */
  private async softDeleteUser(data: UserDeleteData): Promise<void> {
    if (!data.id) return;

    const user = await this.userRepository.findByClerkId(data.id);
    if (!user) return;

    user.deletedAt = new Date();
    await this.userRepository.save(user);
  }
}
