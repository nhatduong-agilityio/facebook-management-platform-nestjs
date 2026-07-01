import { BadRequestException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClerkWebhookService, type ClerkWebhookHeaders } from './clerk-webhook.service';
import type { IUserRepository } from '../ports/user.repository.port';
import { User } from '../entities/user.entity';

// Module-level verify fn shared across tests; reset in beforeEach via vi.clearAllMocks().
// Webhook is mocked as a regular function (not arrow) so `new Webhook(secret)` works.
const mockVerify = vi.fn();
vi.mock('svix', () => ({ Webhook: function () { return { verify: mockVerify }; } }));

const FAKE_HEADERS: ClerkWebhookHeaders = {
  id: 'msg_123',
  timestamp: '1700000000',
  signature: 'v1,abc123',
};

const FAKE_RAW_BODY = Buffer.from('{}');

function makeUserData(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_clerk123',
    email_addresses: [{ id: 'ea_1', email_address: 'alice@example.com' }],
    primary_email_address_id: 'ea_1',
    first_name: 'Alice',
    last_name: 'Smith',
    image_url: 'https://img.example.com/alice.jpg',
    ...overrides,
  };
}

describe('ClerkWebhookService', () => {
  let service: ClerkWebhookService;
  let mockUserRepository: IUserRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUserRepository = {
      findByClerkId: vi.fn(),
      save: vi.fn(),
    } as unknown as IUserRepository;

    const mockConfig = { getOrThrow: vi.fn().mockReturnValue('whsec_test_secret') };

    service = new ClerkWebhookService(mockUserRepository, mockConfig as never);
  });

  describe('handleEvent — user.created', () => {
    it('creates a new user when none exists in DB', async () => {
      const data = makeUserData();
      mockVerify.mockReturnValueOnce({ type: 'user.created', data, object: 'event' });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(null);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      expect(mockUserRepository.save).toHaveBeenCalledOnce();
      const saved = vi.mocked(mockUserRepository.save).mock.calls[0]![0]!;
      expect(saved.clerkUserId).toBe('user_clerk123');
      expect(saved.email).toBe('alice@example.com');
      expect(saved.fullName).toBe('Alice Smith');
      expect(saved.avatarUrl).toBe('https://img.example.com/alice.jpg');
    });

    it('updates an existing user', async () => {
      const data = makeUserData({ first_name: 'Alicia' });
      mockVerify.mockReturnValueOnce({ type: 'user.created', data, object: 'event' });

      const existingUser = Object.assign(new User(), {
        clerkUserId: 'user_clerk123',
        email: 'old@example.com',
      });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(existingUser);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      expect(mockUserRepository.save).toHaveBeenCalledOnce();
      const saved = vi.mocked(mockUserRepository.save).mock.calls[0]![0]!;
      expect(saved.email).toBe('alice@example.com');
      expect(saved.fullName).toBe('Alicia Smith');
    });

    it('falls back to first email when primary_email_address_id does not match', async () => {
      const data = makeUserData({ primary_email_address_id: 'ea_nonexistent' });
      mockVerify.mockReturnValueOnce({ type: 'user.created', data, object: 'event' });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(null);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      const saved = vi.mocked(mockUserRepository.save).mock.calls[0]![0]!;
      expect(saved.email).toBe('alice@example.com');
    });

    it('sets fullName to undefined when both first_name and last_name are null', async () => {
      const data = makeUserData({ first_name: null, last_name: null });
      mockVerify.mockReturnValueOnce({ type: 'user.created', data, object: 'event' });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(null);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      const saved = vi.mocked(mockUserRepository.save).mock.calls[0]![0]!;
      expect(saved.fullName).toBeUndefined();
    });
  });

  describe('handleEvent — user.updated', () => {
    it('upserts user data on user.updated event', async () => {
      const data = makeUserData({ last_name: 'Jones' });
      mockVerify.mockReturnValueOnce({ type: 'user.updated', data, object: 'event' });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(null);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      const saved = vi.mocked(mockUserRepository.save).mock.calls[0]![0]!;
      expect(saved.fullName).toBe('Alice Jones');
    });
  });

  describe('handleEvent — user.deleted', () => {
    it('soft-deletes an active user', async () => {
      mockVerify.mockReturnValueOnce({
        type: 'user.deleted',
        data: { id: 'user_clerk123', deleted: true },
        object: 'event',
      });

      const activeUser = Object.assign(new User(), { clerkUserId: 'user_clerk123' });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(activeUser);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      expect(mockUserRepository.save).toHaveBeenCalledOnce();
      const saved = vi.mocked(mockUserRepository.save).mock.calls[0]![0]!;
      expect(saved.deletedAt).toBeInstanceOf(Date);
    });

    it('is idempotent when user does not exist locally', async () => {
      mockVerify.mockReturnValueOnce({
        type: 'user.deleted',
        data: { id: 'user_clerk123', deleted: true },
        object: 'event',
      });
      vi.mocked(mockUserRepository.findByClerkId).mockResolvedValueOnce(null);

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('skips when deleted event has no id', async () => {
      mockVerify.mockReturnValueOnce({
        type: 'user.deleted',
        data: { deleted: true },
        object: 'event',
      });

      await service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS);

      expect(mockUserRepository.findByClerkId).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('signature verification', () => {
    it('throws BadRequestException when svix rejects the signature', async () => {
      mockVerify.mockImplementationOnce(() => { throw new Error('signature mismatch'); });

      await expect(service.handleEvent(FAKE_RAW_BODY, FAKE_HEADERS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
