import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { type CreateCheckoutParams, IStripeProvider } from '../ports/stripe.provider.port';

/**
 * Calls the Stripe API to create hosted Checkout sessions.
 *
 * Reads `STRIPE_SECRET_KEY` from config. The workspace UUID is stored in session
 * metadata so the T3.2 webhook handler can correlate the payment event back to a workspace.
 */
@Injectable()
export class StripeAdapter extends IStripeProvider {
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    super();
    this.stripe = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'));
  }

  /**
   * Creates a Stripe Checkout session in `subscription` mode.
   *
   * @param params - Session parameters (priceId, workspaceId, redirect URLs).
   * @returns The hosted Checkout URL.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { workspaceId: params.workspaceId },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return { url: session.url };
  }
}
