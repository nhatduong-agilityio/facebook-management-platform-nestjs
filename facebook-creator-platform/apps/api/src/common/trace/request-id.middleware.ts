import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { TraceContextService } from './trace.context';

/**
 * Reads the `requestId` assigned by pino-http's `genReqId` and stores it in
 * `TraceContextService` so it is available throughout the async call chain.
 *
 * pino-http sets `req.id` before Express middleware runs, so the value is always
 * present by the time this middleware executes.
 *
 * Applied globally in `AppModule.configure()`.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly traceCtx: TraceContextService) {}

  /** @inheritdoc */
  use(req: Request, _res: Response, next: NextFunction): void {
    const requestId = (req as Request & { id?: string }).id ?? 'unknown';
    this.traceCtx.run(requestId, next);
  }
}
