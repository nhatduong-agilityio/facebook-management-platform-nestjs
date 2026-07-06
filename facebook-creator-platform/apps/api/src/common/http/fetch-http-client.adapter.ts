import { Injectable } from '@nestjs/common';
import { IHttpClient, DownstreamServiceError } from './http-client.port';

/** Abort timeout for all outbound requests (ms). Prevents gateway hang on slow downstreams. */
const TIMEOUT_MS = 5_000;

/**
 * `IHttpClient` implementation backed by the Node 25 built-in `fetch`.
 *
 * - Applies a 5-second `AbortSignal.timeout` to every request.
 * - Converts non-2xx responses and network failures into `DownstreamServiceError`
 *   so callers never see raw `ECONNREFUSED` strings.
 */
@Injectable()
export class FetchHttpClientAdapter extends IHttpClient {
  /**
   * GETs a URL and returns the parsed JSON body.
   *
   * @param url - Fully-qualified target URL.
   * @returns Parsed body cast to `T`.
   * @throws {DownstreamServiceError} on non-2xx status or connection/timeout failure.
   */
  async get<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      // Network error, DNS failure, AbortError (timeout) — all surface as 503
      throw new DownstreamServiceError(503, url);
    }
    if (!res.ok) throw new DownstreamServiceError(res.status, url);
    return res.json() as Promise<T>;
  }
}
