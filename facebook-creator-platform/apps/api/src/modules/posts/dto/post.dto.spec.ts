import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePostDto } from './post.dto';
import { UpdatePostStatusDto } from './update-post-status.dto';

/**
 * Validates that `scheduledAt` fields on both DTO classes enforce a timezone offset.
 * A bare local-time string (`2026-08-01T10:00:00`) must be rejected with a
 * validation error; a UTC string (`2026-08-01T10:00:00.000Z`) must pass.
 *
 * This guards BR-F06 and the "Timestamps: ISO 8601 UTC" API contract —
 * without a timezone, `new Date(str)` parses as server local time and posts
 * can be scheduled at the wrong absolute moment.
 */
describe('CreatePostDto — scheduledAt', () => {
  it('rejects a datetime string with no timezone offset', async () => {
    const dto = plainToInstance(CreatePostDto, {
      content: 'Hello world',
      scheduledAt: '2026-08-01T10:00:00',
    });
    const errors = await validate(dto);
    const field = errors.find((e) => e.property === 'scheduledAt');
    expect(field).toBeDefined();
  });

  it('accepts a datetime string with a UTC (Z) timezone offset', async () => {
    const dto = plainToInstance(CreatePostDto, {
      content: 'Hello world',
      scheduledAt: '2026-08-01T10:00:00.000Z',
    });
    const errors = await validate(dto);
    const field = errors.find((e) => e.property === 'scheduledAt');
    expect(field).toBeUndefined();
  });
});

describe('UpdatePostStatusDto — scheduledAt', () => {
  it('rejects a datetime string with no timezone offset', async () => {
    const dto = plainToInstance(UpdatePostStatusDto, {
      status: 'scheduled',
      scheduledAt: '2026-08-01T10:00:00',
    });
    const errors = await validate(dto);
    const field = errors.find((e) => e.property === 'scheduledAt');
    expect(field).toBeDefined();
  });

  it('accepts a datetime string with a UTC (Z) timezone offset', async () => {
    const dto = plainToInstance(UpdatePostStatusDto, {
      status: 'scheduled',
      scheduledAt: '2026-08-01T10:00:00.000Z',
    });
    const errors = await validate(dto);
    const field = errors.find((e) => e.property === 'scheduledAt');
    expect(field).toBeUndefined();
  });
});
