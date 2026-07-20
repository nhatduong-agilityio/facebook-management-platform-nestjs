import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/core';
import type { Logger } from 'nestjs-pino';
import { WorkspacePurgeJob } from './workspace-purge.job';

const mockExecute = vi.fn();
const mockConn = { execute: mockExecute };
const mockForkEm = { getConnection: () => mockConn };
const mockFork = vi.fn().mockReturnValue(mockForkEm);
const mockOrm = { em: { fork: mockFork } } as unknown as MikroORM;
const mockLogger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;

describe('WorkspacePurgeJob', () => {
  let job: WorkspacePurgeJob;

  beforeEach(() => {
    job = new WorkspacePurgeJob(mockOrm, mockLogger);
    vi.clearAllMocks();
    mockFork.mockReturnValue(mockForkEm);
    // Default: zero rows deleted → each batch terminates immediately (1 call per table).
    mockExecute.mockResolvedValue({ rowCount: 0 });
  });

  // ---------------------------------------------------------------------------
  // Forked EM
  // ---------------------------------------------------------------------------

  it('forks the EntityManager once per run (ADR-054)', async () => {
    await job.run();
    expect(mockFork).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Happy path — zero rows (empty workspace, loop exits first iteration)
  // ---------------------------------------------------------------------------

  it('executes exactly 5 DELETE statements when no rows match', async () => {
    await job.run();
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('deletes in FK-safe order: posts → accounts → members → invitations → workspaces', async () => {
    await job.run();

    const sqls: string[] = mockExecute.mock.calls.map((c: [string]) => c[0]);
    expect(sqls[0]).toContain('core.posts');
    expect(sqls[1]).toContain('core.facebook_accounts');
    expect(sqls[2]).toContain('core.workspace_members');
    expect(sqls[3]).toContain('core.invitations');
    expect(sqls[4]).toContain('core.workspaces');
  });

  it('uses LIMIT subquery in each DELETE statement (batching)', async () => {
    await job.run();

    const sqls: string[] = mockExecute.mock.calls.map((c: [string]) => c[0]);
    for (const sql of sqls) {
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('WHERE id IN');
    }
  });

  // ---------------------------------------------------------------------------
  // Batching — loops until rowCount reaches 0
  // ---------------------------------------------------------------------------

  it('loops per table until rowCount is 0, then moves to the next table', async () => {
    // posts needs 2 iterations (500 rows, then 0); all others exit immediately.
    mockExecute
      .mockResolvedValueOnce({ rowCount: 500 }) // posts batch 1
      .mockResolvedValueOnce({ rowCount: 0 })   // posts batch 2 → exit
      .mockResolvedValueOnce({ rowCount: 0 })   // accounts
      .mockResolvedValueOnce({ rowCount: 0 })   // members
      .mockResolvedValueOnce({ rowCount: 0 })   // invitations
      .mockResolvedValueOnce({ rowCount: 0 });  // workspaces

    await job.run();

    // 2 calls for posts + 1 each for the rest = 6 total
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('logs total row counts (summed across batches) on success', async () => {
    mockExecute
      .mockResolvedValueOnce({ rowCount: 300 }) // posts batch 1
      .mockResolvedValueOnce({ rowCount: 0 })   // posts done (total: 300)
      .mockResolvedValueOnce({ rowCount: 2 })   // accounts
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1 })   // members
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })   // invitations
      .mockResolvedValueOnce({ rowCount: 1 })   // workspaces
      .mockResolvedValueOnce({ rowCount: 0 });

    await job.run();

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'WorkspacePurgeJob completed',
        posts: 300,
        accounts: 2,
        members: 1,
        invitations: 0,
        workspaces: 1,
      }),
    );
  });

  it('treats missing rowCount as 0', async () => {
    mockExecute.mockResolvedValue({});

    await job.run();

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ posts: 0, workspaces: 0 }),
    );
  });

  // ---------------------------------------------------------------------------
  // Error path
  // ---------------------------------------------------------------------------

  it('catches DB errors and logs them without rethrowing', async () => {
    mockExecute.mockRejectedValue(new Error('connection lost'));

    await expect(job.run()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'WorkspacePurgeJob failed' }),
    );
  });

  it('does not call logger.log when an error occurs', async () => {
    mockExecute.mockRejectedValue(new Error('timeout'));

    await job.run();

    expect(mockLogger.log).not.toHaveBeenCalled();
  });
});
