import { describe, it, expect, beforeEach } from 'vitest';
import { BillingRedirectController } from './billing-redirect.controller';

describe('BillingRedirectController', () => {
  let controller: BillingRedirectController;

  beforeEach(() => {
    controller = new BillingRedirectController();
  });

  it('checkoutSuccess returns status success', () => {
    expect(controller.checkoutSuccess()).toEqual({ status: 'success' });
  });

  it('checkoutCancel returns status cancelled', () => {
    expect(controller.checkoutCancel()).toEqual({ status: 'cancelled' });
  });
});
