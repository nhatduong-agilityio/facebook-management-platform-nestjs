import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InternalFacebookController } from './internal-api.controller';
import { IFacebookAccountRepository } from './ports/facebook-account.repository.port';
import type { FacebookAccount } from './entities/facebook-account.entity';

const makeAccount = (overrides: Partial<FacebookAccount> = {}): FacebookAccount =>
  ({ id: 'fa-1', accessToken: 'decrypted-page-token', ...overrides }) as FacebookAccount;

describe('InternalFacebookController', () => {
  let controller: InternalFacebookController;
  let accounts: IFacebookAccountRepository;

  beforeEach(() => {
    accounts = { findById: vi.fn() } as unknown as IFacebookAccountRepository;
    controller = new InternalFacebookController(accounts);
  });

  describe('getAccount', () => {
    it('returns id and pageToken for a known account', async () => {
      vi.mocked(accounts.findById).mockResolvedValue(makeAccount());

      const result = await controller.getAccount('fa-1');

      expect(result).toEqual({ id: 'fa-1', pageToken: 'decrypted-page-token' });
    });

    it('throws NotFoundException when the account does not exist', async () => {
      vi.mocked(accounts.findById).mockResolvedValue(null);

      await expect(controller.getAccount('unknown-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
