/**
 * Domain error codes that `services/billing` can return in an HTTP error response.
 *
 * Consumers should treat any unrecognised code as `INTERNAL`.
 */
export type BillingErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'INTERNAL';

/**
 * JSON body shape of an error response from `services/billing`.
 */
export interface BillingErrorResponse {
  /** Machine-readable error code. */
  code: BillingErrorCode;
  /** Human-readable description. */
  message: string;
  /** Optional structured details (e.g. the offending field). */
  details?: Record<string, unknown>;
}
