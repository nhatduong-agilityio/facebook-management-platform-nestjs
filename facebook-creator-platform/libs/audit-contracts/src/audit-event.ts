/**
 * Wire shape of a single audit record returned by `services/audit` over HTTP.
 *
 * `receivedAt` is serialised as an ISO-8601 string in transit; consumers are
 * responsible for converting it to a `Date` if needed.
 *
 * Consumed by `apps/api` to serve `GET /workspaces/:id/audit-logs` and
 * `GET /workspaces/:id/audit-logs/:id` (Owner-only).
 */
export interface AuditEventResponse {
  _id: string;
  eventId: string;
  routingKey: string;
  workspaceId: string | null;
  payload: Record<string, unknown>;
  receivedAt: string;
}
