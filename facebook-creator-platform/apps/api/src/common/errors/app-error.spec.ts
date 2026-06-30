import { describe, it, expect } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { AppError, AppErrorCode } from './app-error';
import { toHttpException } from '../http/to-http-exception';

describe('AppError', () => {
  it('constructs with code, message, and optional details', () => {
    const e = new AppError('NOT_FOUND', 'Workspace not found', { id: '123' });
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('Workspace not found');
    expect(e.details).toEqual({ id: '123' });
  });

  it('notFound factory', () => {
    const e = AppError.notFound('Post');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('Post not found');
  });

  it('notFound factory with details', () => {
    const e = AppError.notFound('Workspace', { id: 'abc' });
    expect(e.details).toEqual({ id: 'abc' });
  });

  it('forbidden factory uses default message', () => {
    const e = AppError.forbidden();
    expect(e.code).toBe('FORBIDDEN');
    expect(e.message).toBe('Forbidden');
  });

  it('forbidden factory accepts custom message', () => {
    const e = AppError.forbidden('You cannot remove the sole owner');
    expect(e.message).toBe('You cannot remove the sole owner');
  });

  it('conflict factory', () => {
    const e = AppError.conflict('Slug already taken', { slug: 'my-ws' });
    expect(e.code).toBe('CONFLICT');
    expect(e.details).toEqual({ slug: 'my-ws' });
  });

  it('unauthorized factory', () => {
    const e = AppError.unauthorized();
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('internal factory', () => {
    const e = AppError.internal('DB unreachable');
    expect(e.code).toBe('INTERNAL');
  });
});

describe('toHttpException', () => {
  const cases: [AppErrorCode, HttpStatus][] = [
    ['NOT_FOUND', HttpStatus.NOT_FOUND],
    ['FORBIDDEN', HttpStatus.FORBIDDEN],
    ['UNAUTHORIZED', HttpStatus.UNAUTHORIZED],
    ['VALIDATION_ERROR', HttpStatus.BAD_REQUEST],
    ['CONFLICT', HttpStatus.CONFLICT],
    ['PLAN_LIMIT_EXCEEDED', HttpStatus.CONFLICT],
    ['INVALID_STATE_TRANSITION', HttpStatus.CONFLICT],
    ['CROSS_WORKSPACE', HttpStatus.FORBIDDEN],
    ['INTERNAL', HttpStatus.INTERNAL_SERVER_ERROR],
  ];

  it.each(cases)('%s maps to HTTP %i', (code, expectedStatus) => {
    const exception = toHttpException(new AppError(code, 'test'));
    expect(exception.getStatus()).toBe(expectedStatus);
  });

  it('response body includes code and message', () => {
    const exception = toHttpException(AppError.notFound('User'));
    const body = exception.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('User not found');
  });

  it('response body includes details when present', () => {
    const exception = toHttpException(AppError.conflict('Already exists', { field: 'email' }));
    const body = exception.getResponse() as Record<string, unknown>;
    expect(body.details).toEqual({ field: 'email' });
  });

  it('response body omits details when absent', () => {
    const exception = toHttpException(AppError.forbidden());
    const body = exception.getResponse() as Record<string, unknown>;
    expect(body).not.toHaveProperty('details');
  });
});
