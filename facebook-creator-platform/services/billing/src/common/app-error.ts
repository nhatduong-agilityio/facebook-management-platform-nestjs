import type { BillingErrorCode } from '@fcp/billing-contracts';

/**
 * Typed domain error used throughout the billing service.
 *
 * Service methods return `Result<T, AppError>` (neverthrow) instead of throwing.
 * The HTTP controller maps `AppError` codes to appropriate HTTP status codes via
 * `toHttpException`, and the wire representation uses `BillingErrorResponse` from
 * `@fcp/billing-contracts`.
 *
 * `code` is typed as `BillingErrorCode` so any drift from the shared contract is
 * caught at compile time.
 */
export class AppError {
  constructor(
    readonly code: BillingErrorCode,
    readonly message: string,
    readonly details?: Record<string, unknown>,
  ) {}

  /** Creates a NOT_FOUND error for a named resource. */
  static notFound(what: string, details?: Record<string, unknown>): AppError {
    return new AppError('NOT_FOUND', `${what} not found`, details);
  }

  /** Creates a CONFLICT error. */
  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, details);
  }
}
