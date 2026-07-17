import { Global, Module } from '@nestjs/common';
import { TraceContextService } from './trace.context';

/**
 * Global module that provides a single `TraceContextService` instance
 * to every module in the application.
 *
 * Must be imported exactly once (in `AppModule`) — the `@Global()` decorator
 * makes `TraceContextService` available everywhere without re-importing.
 */
@Global()
@Module({
  providers: [TraceContextService],
  exports: [TraceContextService],
})
export class TraceModule {}
