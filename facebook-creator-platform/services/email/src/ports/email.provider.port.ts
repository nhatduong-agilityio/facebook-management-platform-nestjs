/**
 * Options for sending a single email (ADR-056).
 *
 * Template rendering details are provider-specific; only the minimal
 * contract required by all implementations is captured here.
 */
export interface SendEmailOptions {
  /** Recipient email address. */
  to: string;
  /**
   * Subject line. Required for the inline HTML fallback (local dev).
   * Ignored when a Resend template ID is configured — the template owns the subject.
   */
  subject?: string;
  /** Short human-readable template name (e.g. `'member-invitation'`). Stored in `EmailDeliveryLog` and used by the provider to derive the env var key. */
  templateName: string;
  /** Arbitrary key-value data injected into the template. */
  data: Record<string, unknown>;
}

/**
 * Port: outbound email delivery capability.
 *
 * The initial implementation is `ResendEmailProvider` (ADR-056).
 * Swap to `SESEmailProvider` or `SendGridEmailProvider` by rebinding
 * this token in the module — no consumer code changes required.
 */
export abstract class IEmailProvider {
  /**
   * Sends a single transactional email.
   *
   * @param opts - Addressing, subject, template, and data payload.
   * @throws Infrastructure error on delivery failure (retried by RabbitMQ redelivery).
   */
  abstract send(opts: SendEmailOptions): Promise<void>;
}
