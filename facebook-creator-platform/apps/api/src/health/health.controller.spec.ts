import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns { status: "ok" }', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
