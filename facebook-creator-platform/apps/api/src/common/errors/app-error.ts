/**
 * Union of all domain error codes used across the platform.
 * Controllers map these to HTTP status codes via toHttpException().
 */
export type AppErrorCode =
  | 'VALIDATION_ERROR'        // request shape or field-level rule violation
  | 'UNAUTHORIZED'            // no valid authentication credential
  | 'FORBIDDEN'               // authenticated but not authorised for this resource
  | 'NOT_FOUND'               // resource does not exist or is soft-deleted
  | 'CONFLICT'                // unique constraint or business-rule collision
  | 'PLAN_LIMIT_EXCEEDED'     // owner's subscription plan cap reached
  | 'INVALID_STATE_TRANSITION'// attempted a state-machine transition that is not allowed
  | 'CROSS_WORKSPACE'         // operation spans workspace boundary (BR-R06)
  | 'INTERNAL';               // unexpected infrastructure or programmer error

/**
 * Typed domain error returned by all service methods instead of throwing.
 * Use the static factories for the common cases; construct directly for custom messages.
 */
export class AppError {
  /**
   * @param code    - Machine-readable error code; drives HTTP status mapping.
   * @param message - Human-readable description safe to surface in API responses.
   * @param details - Optional structured context for debugging (never include PII).
   */
  constructor(
    readonly code: AppErrorCode,
    readonly message: string,
    readonly details?: Record<string, unknown>,
  ) {}

  /**
   * Creates a NOT_FOUND error for a named resource.
   *
   * @param what    - Human-readable resource name, e.g. `'Workspace'`.
   * @param details - Optional structured context.
   * @returns AppError with code NOT_FOUND and message `"<what> not found"`.
   */
  static notFound(what: string, details?: Record<string, unknown>) {
    return new AppError('NOT_FOUND', `${what} not found`, details);
  }

  /**
   * Creates a FORBIDDEN error.
   *
   * @param message - Override the default `"Forbidden"` message if needed.
   * @returns AppError with code FORBIDDEN.
   */
  static forbidden(message = 'Forbidden') {
    return new AppError('FORBIDDEN', message);
  }

  /**
   * Creates a CONFLICT error for unique-constraint or business-rule violations.
   *
   * @param message - Description of the conflict.
   * @param details - Optional structured context.
   * @returns AppError with code CONFLICT.
   */
  static conflict(message: string, details?: Record<string, unknown>) {
    return new AppError('CONFLICT', message, details);
  }

  /**
   * Creates an UNAUTHORIZED error.
   *
   * @param message - Override the default `"Unauthorized"` message if needed.
   * @returns AppError with code UNAUTHORIZED.
   */
  static unauthorized(message = 'Unauthorized') {
    return new AppError('UNAUTHORIZED', message);
  }

  /**
   * Creates an INTERNAL error for unexpected infrastructure or programmer failures.
   *
   * @param message - Description of the failure (do not include PII).
   * @param details - Optional structured context.
   * @returns AppError with code INTERNAL.
   */
  static internal(message: string, details?: Record<string, unknown>) {
    return new AppError('INTERNAL', message, details);
  }
}
