/**
 * Structured error thrown by `IHttpClient` implementations.
 *
 * `status` is:
 * - The HTTP status code when the downstream server responded (e.g. 404, 500).
 * - `503` when the connection was refused or timed out (never reached the server).
 *
 * Controllers and adapters discriminate on `status` to map to the correct `AppError`.
 */
export class DownstreamServiceError extends Error {
  /**
   * @param status     - HTTP status from the downstream server, or 503 for connection failures.
   * @param serviceUrl - Base URL of the downstream service (logged, never sent to clients).
   */
  constructor(
    readonly status: number,
    readonly serviceUrl: string,
  ) {
    super(`Downstream service at ${serviceUrl} responded with ${status}`);
    this.name = 'DownstreamServiceError';
  }
}

/**
 * Port: outbound HTTP client contract.
 *
 * Implementations handle transport concerns (fetch, timeout, error normalisation).
 * Adapters and controllers depend only on this abstract class — swapping from native
 * `fetch` to Axios/undici or from HTTP to RabbitMQ RPC requires only a new implementation,
 * no changes to callers.
 */
export abstract class IHttpClient {
  /**
   * Performs a GET request and returns the parsed JSON body.
   *
   * @param url - Fully-qualified URL to request.
   * @returns Parsed response body typed as `T`.
   * @throws {DownstreamServiceError} on non-2xx response or network/timeout failure.
   */
  abstract get<T>(url: string): Promise<T>;
}
