import { Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { INotificationRepository } from '../ports/notification.repository.port';
import { IInternalApiClient } from '../ports/internal-api.client.port';

/**
 * Cold-start reconciler for `workspace_members_projection` (ADR-059).
 *
 * On boot it reads the distinct workspace IDs already in the projection (persisted
 * from previous events) and re-upserts each workspace's membership from
 * `GET /internal/workspaces/:id/members`. This closes any gap caused by events
 * missed while the service was down.
 *
 * Skips reconciliation when the projection is empty (very first boot) to avoid
 * hammering `apps/api` unnecessarily — the projection will be populated organically
 * by incoming `workspace.member-joined` events.
 */
@Injectable()
export class WorkspaceMemberReconciler implements OnModuleInit {
  /**
   * @param repo     - Notification repository for projection reads/upserts.
   * @param internal - Internal API client that calls `apps/api`.
   * @param logger   - Pino logger.
   */
  constructor(
    private readonly repo: INotificationRepository,
    private readonly internal: IInternalApiClient,
    private readonly logger: Logger,
  ) {}

  /** Triggered once after the module's dependencies are resolved. */
  async onModuleInit(): Promise<void> {
    try {
      await this.reconcile();
    } catch (err) {
      /* Non-fatal — service must not crash if projection DB is unavailable on boot.
         Most likely cause: migration not yet run (`notification` schema missing). */
      this.logger.error(
        { err },
        'WorkspaceMemberReconciler: cold-start reconciliation failed, service will continue without it',
      );
    }
  }

  /**
   * Fetches all known workspace IDs from the projection and re-upserts membership
   * state from `apps/api` for each one.
   *
   * Errors for individual workspaces are caught and logged so a single failure does
   * not abort reconciliation of remaining workspaces.
   */
  async reconcile(): Promise<void> {
    const workspaceIds = await this.repo.getDistinctProjectionWorkspaceIds();

    if (workspaceIds.length === 0) {
      this.logger.log('WorkspaceMemberReconciler: projection empty, skipping cold-start reconciliation');
      return;
    }

    this.logger.log(
      { count: workspaceIds.length },
      'WorkspaceMemberReconciler: starting cold-start reconciliation',
    );

    for (const workspaceId of workspaceIds) {
      await this.reconcileWorkspace(workspaceId);
    }
  }

  /**
   * Seeds the projection for a single workspace by calling
   * `GET /internal/workspaces/:id/members` on `apps/api`.
   *
   * Safe to call at any time — upserts rows, so it is idempotent.
   *
   * @param workspaceId - UUID of the workspace to seed.
   * @returns Number of members upserted.
   */
  async reconcileWorkspace(workspaceId: string): Promise<{ seeded: number }> {
    try {
      const members = await this.internal.getWorkspaceMembers(workspaceId);
      for (const m of members) {
        await this.repo.upsertProjectionMember(workspaceId, m.userId, m.role);
      }
      this.logger.log(
        { workspaceId, memberCount: members.length },
        'WorkspaceMemberReconciler: workspace reconciled',
      );
      return { seeded: members.length };
    } catch (err) {
      this.logger.error(
        { workspaceId, err },
        'WorkspaceMemberReconciler: failed to reconcile workspace, continuing',
      );
      return { seeded: 0 };
    }
  }
}
