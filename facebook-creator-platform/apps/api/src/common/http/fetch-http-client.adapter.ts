import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IHttpClient, DownstreamServiceError } from './http-client.port';

/**
 * `IHttpClient` implementation backed by the Node 25 built-in `fetch`.
 *
 * - Applies a configurable `AbortSignal.timeout` to every request.
 *   Timeout is read from `HTTP_CLIENT_TIMEOUT_MS` env var (default 5 000 ms).
 * - Converts non-2xx responses and network failures into `DownstreamServiceError`
 *   so callers never see raw `ECONNREFUSED` strings.
 */
@Injectable()
export class FetchHttpClientAdapter extends IHttpClient {
  private readonly timeoutMs: number;

  /** @param config - NestJS `ConfigService`; reads `HTTP_CLIENT_TIMEOUT_MS` (default 5 000). */
  constructor(private readonly config: ConfigService) {
    super();
    this.timeoutMs = this.config.get<number>('HTTP_CLIENT_TIMEOUT_MS', 5_000);
  }

  /**
   * GETs a URL and returns the parsed JSON body.
   *
   * @param url - Fully-qualified target URL.
   * @returns Parsed body cast to `T`.
   * @throws {DownstreamServiceError} on non-2xx status or connection/timeout failure.
   */
  async get<T>(url: string): Promise<T> {
    return this.request<T>('GET', url);
  }

  /**
   * PATCHes a URL with an optional JSON body and returns the parsed JSON body.
   *
   * @param url  - Fully-qualified target URL.
   * @param body - Optional request body serialized as JSON.
   * @returns Parsed body cast to `T`.
   * @throws {DownstreamServiceError} on non-2xx status or connection/timeout failure.
   */
  async patch<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', url, body);
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new DownstreamServiceError(503, url);
    }
    if (!res.ok) throw new DownstreamServiceError(res.status, url);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
