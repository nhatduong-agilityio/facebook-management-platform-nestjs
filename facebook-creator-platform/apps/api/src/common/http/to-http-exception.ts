import { HttpException, HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';

const CODE_STATUS: Record<string, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  CONFLICT: HttpStatus.CONFLICT,
  PLAN_LIMIT_EXCEEDED: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  CROSS_WORKSPACE: HttpStatus.FORBIDDEN,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Converts a domain AppError into a NestJS HttpException suitable for throwing
 * inside a controller or exception filter.
 *
 * The response body always contains `{ code, message }` and, when present, `details`.
 * Unknown codes fall back to 500 so nothing leaks as a silent 200.
 *
 * @param e - The domain error to convert.
 * @returns NestJS HttpException with the appropriate HTTP status code.
 */
export function toHttpException(e: AppError): HttpException {
  return new HttpException(
    { code: e.code, message: e.message, ...(e.details && { details: e.details }) },
    CODE_STATUS[e.code] ?? HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
