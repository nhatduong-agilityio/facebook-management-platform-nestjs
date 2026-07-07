import { describe, it, expect, vi } from 'vitest';
import { Logger } from 'nestjs-pino';
import { WorkspaceMemberReconciler } from './workspace-member.reconciler';
import { INotificationRepository } from '../ports/notification.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';

function makeReconciler(opts: {
  getDistinctIds?: () => Promise<string[]>;
  getWorkspaceMembers?: (id: string) => Promise<Array<{ userId: string; role: string }>>;
  upsert?: () => Promise<void>;
}) {
  const repo = {
    getDistinctProjectionWorkspaceIds: vi.fn(opts.getDistinctIds ?? (() => Promise.resolve([]))),
    upsertProjectionMember: vi.fn(opts.upsert ?? (() => Promise.resolve())),
  } as unknown as INotificationRepository;

  const internalApi = {
    getWorkspaceMembers: vi.fn(opts.getWorkspaceMembers ?? (() => Promise.resolve([]))),
  } as unknown as IInternalApiClient;

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  return { reconciler: new WorkspaceMemberReconciler(repo, internalApi, logger), repo, internalApi, logger };
}

describe('WorkspaceMemberReconciler', () => {
  it('skips reconciliation when projection is empty', async () => {
    const { reconciler, internalApi } = makeReconciler({ getDistinctIds: () => Promise.resolve([]) });
    await reconciler.reconcile();
    expect(internalApi.getWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('upserts all members for each workspace', async () => {
    const members = [
      { userId: 'u1', role: 'owner' },
      { userId: 'u2', role: 'editor' },
    ];
    const { reconciler, repo } = makeReconciler({
      getDistinctIds: () => Promise.resolve(['ws-001', 'ws-002']),
      getWorkspaceMembers: () => Promise.resolve(members),
    });
    await reconciler.reconcile();
    expect(repo.upsertProjectionMember).toHaveBeenCalledTimes(4); // 2 workspaces × 2 members
  });

  it('continues reconciling other workspaces when one fails', async () => {
    let callCount = 0;
    const { reconciler, repo, logger } = makeReconciler({
      getDistinctIds: () => Promise.resolve(['ws-fail', 'ws-ok']),
      getWorkspaceMembers: (id) => {
        callCount++;
        if (id === 'ws-fail') return Promise.reject(new Error('network error'));
        return Promise.resolve([{ userId: 'u1', role: 'editor' }]);
      },
    });
    await reconciler.reconcile();
    expect(callCount).toBe(2);
    expect(repo.upsertProjectionMember).toHaveBeenCalledTimes(1); // only ws-ok succeeded
    expect(logger.error).toHaveBeenCalled();
  });
});
