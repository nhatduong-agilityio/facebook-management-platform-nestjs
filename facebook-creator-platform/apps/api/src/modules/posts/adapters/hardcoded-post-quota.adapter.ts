import { Injectable } from '@nestjs/common';
import { IPostQuotaProvider } from '../ports/post-quota.provider.port';

/**
 * Stub quota adapter that returns the free-plan post limit (10) for every workspace.
 *
 * Swapped for a real billing lookup in T3.1 (`billing.plans.post_limit` via subscription).
 * The service and port contract do not change — only this adapter is replaced.
 */
@Injectable()
export class HardcodedPostQuotaAdapter extends IPostQuotaProvider {
  /** @inheritdoc */
  async getPostLimit(_workspaceId: string): Promise<number> {
    return 10;
  }
}
