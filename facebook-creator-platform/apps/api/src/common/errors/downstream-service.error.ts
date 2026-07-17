/**
 * Structured error thrown by TCP adapters when a downstream microservice call fails.
 *
 * `status` is:
 * - The HTTP-equivalent status code when the downstream service returned an error
 *   (e.g. 404 for NOT_FOUND, 500 for INTERNAL, 503 for timeout / connection refused).
 * - `503` when the TCP connection was refused or the call timed out.
 *
 * Controllers discriminate on `status` to map to the correct HTTP response code.
 */
export class DownstreamServiceError extends Error {
  /**
   * @param status     - HTTP-equivalent status code for the failure.
   * @param serviceUrl - Service name or URL (logged, never sent to clients).
   */
  constructor(
    readonly status: number,
    readonly serviceUrl: string,
  ) {
    super(`Downstream service at ${serviceUrl} responded with ${status}`);
    this.name = 'DownstreamServiceError';
  }
}
