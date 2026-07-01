/**
 * Workspace-scoped RBAC role assigned to a member.
 *
 * - `owner`  — full control: manage members, connect Facebook pages, billing.
 * - `editor` — can create/edit/schedule posts and connect Facebook pages.
 * - `viewer` — read-only access to workspace content.
 *
 * Maps to the CHECK constraint in `core.workspace_members.role` (BR-F03a).
 */
export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

/**
 * Ordered numeric weight for each role.
 * Higher value = broader permissions.
 * Use for "at least X role" comparisons: `ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required]`.
 */
export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};
