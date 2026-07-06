import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/**
 * Handles Stripe Checkout browser redirects after payment completion or cancellation.
 *
 * These endpoints have no auth guard — Stripe redirects the end-user's browser here
 * directly. In an API-first deployment the client app should watch for these redirects
 * (e.g. via a WebView callback or polling) and react accordingly.
 *
 * Routes: `GET /api/v1/billing/success` and `GET /api/v1/billing/cancel`.
 * Configured via `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` in `services/billing`.
 */
@ApiExcludeController()
@Controller('billing')
export class BillingRedirectController {
  /**
   * Stripe redirects here after a successful checkout session.
   *
   * @returns `{ status: 'success' }` — client should poll subscription state to confirm.
   */
  @Get('success')
  @HttpCode(HttpStatus.OK)
  checkoutSuccess(): { status: string } {
    return { status: 'success' };
  }

  /**
   * Stripe redirects here when the user cancels or closes the Checkout page.
   *
   * @returns `{ status: 'cancelled' }` — no subscription change occurred.
   */
  @Get('cancel')
  @HttpCode(HttpStatus.OK)
  checkoutCancel(): { status: string } {
    return { status: 'cancelled' };
  }
}
