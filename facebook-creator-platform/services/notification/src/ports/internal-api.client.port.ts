/**
 * Port: client for `apps/api` internal endpoints (ADR-050).
 *
 * Bound to `InternalApiAdapter` in `NotificationModule`.
 * Used during cold-start reconciliation to fetch current workspace membership state.
 */
export abstract class IInternalApiClient {
  /**
   * Fetches all current members of a workspace from `apps/api`.
   *
   * Calls `GET /internal/workspaces/:id/members` with `x-internal-secret` header.
   *
   * @param workspaceId - UUID of the workspace to fetch members for.
   * @returns Array of `{ userId, role }` for all current members.
   */
  abstract getWorkspaceMembers(
    workspaceId: string,
  ): Promise<Array<{ userId: string; role: string }>>;
}
