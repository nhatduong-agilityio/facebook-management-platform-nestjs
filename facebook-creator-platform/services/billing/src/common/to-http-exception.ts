import { HttpException, HttpStatus } from '@nestjs/common';
import type { BillingErrorCode, BillingErrorResponse } from '@fcp/billing-contracts';
import { AppError } from './app-error';

const CODE_STATUS: Record<BillingErrorCode, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Maps a billing `AppError` to a NestJS `HttpException`.
 *
 * The response body conforms to `BillingErrorResponse` from `@fcp/billing-contracts`
 * so consumers can deserialise it with a known shape.
 *
 * @param e - The domain error to convert.
 * @returns An `HttpException` with the appropriate HTTP status code.
 */
export function toHttpException(e: AppError): HttpException {
  const body: BillingErrorResponse = {
    code: e.code,
    message: e.message,
    ...(e.details && { details: e.details }),
  };
  return new HttpException(body, CODE_STATUS[e.code] ?? HttpStatus.INTERNAL_SERVER_ERROR);
}
