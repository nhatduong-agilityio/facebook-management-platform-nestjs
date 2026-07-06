/**
 * Domain error codes used by `services/audit`.
 */
export type AppErrorCode = 'NOT_FOUND' | 'INTERNAL';

/**
 * Represents a domain or application error returned via the Result pattern.
 * Never thrown for expected failures — always returned as `err(AppError)`.
 */
export class AppError {
  constructor(
    readonly code: AppErrorCode,
    readonly message: string,
  ) {}

  /**
   * Creates a NOT_FOUND error.
   *
   * @param what - Human-readable description of the missing resource.
   */
  static notFound(what: string): AppError {
    return new AppError('NOT_FOUND', `${what} not found`);
  }
}
