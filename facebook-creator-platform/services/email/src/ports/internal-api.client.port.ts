/**
 * Port: inbound data resolver for cross-service PII lookup (ADR-050).
 *
 * `services/email` cannot read `core.users` or `core.workspaces` directly
 * (cross-schema, BR-R06). These methods call the appropriate
 * `GET /internal/…` endpoints on `apps/api` secured by `INTERNAL_API_SECRET`.
 */
export abstract class IInternalApiClient {
  /**
   * Resolves the email address for a given internal user id.
   *
   * Used by consumers for `posts.published` and `posts.failed` to obtain
   * the post author's email from `createdByUserId` in the event payload.
   *
   * @param userId - UUID v7 of the `core.users` record.
   * @returns The user's email address.
   * @throws When the user is not found or the internal API is unreachable.
   */
  abstract getUserEmail(userId: string): Promise<string>;

  /**
   * Resolves the workspace owner's email address.
   *
   * Used by consumers for `billing.payment_failed` and `facebook.token_expiring`
   * to address the email to the workspace owner.
   *
   * @param workspaceId - UUID v7 of the `core.workspaces` record.
   * @returns `{ ownerEmail }`.
   * @throws When the workspace is not found or the internal API is unreachable.
   */
  abstract getWorkspaceOwnerEmail(workspaceId: string): Promise<{ ownerEmail: string }>;

  /**
   * Fetches the single-use token needed to build the magic-link `acceptUrl`
   * for the member-invitation email.
   *
   * The token is intentionally absent from `MemberInvitedEvent` — calling this
   * endpoint is the only authorised path to obtain it (ADR-050, security).
   *
   * @param invitationId - UUID v7 of the `workspace.invitations` record.
   * @returns `{ token }` — the 64-char hex magic-link token.
   * @throws When the invitation is not found or the internal API is unreachable.
   */
  abstract getInvitationEmailContext(invitationId: string): Promise<{ token: string }>;
}
