import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { IEmailProvider, SendEmailOptions } from '../ports/email.provider.port';
import { PermanentEmailError } from '../errors/permanent-email.error';

/**
 * `IEmailProvider` implementation using the Resend API (ADR-056).
 *
 * `SendEmailOptions.templateName` is a short human-readable name (e.g. `'member-invitation'`).
 * The provider derives the env var key at send time as
 * `RESEND_TEMPLATE_<UPPER_SNAKE_CASE>` and reads the Resend template ID from it.
 * When the env var is absent it falls back to minimal inline HTML for local dev.
 */
@Injectable()
export class ResendEmailProvider extends IEmailProvider {
  private readonly client: Resend;
  private readonly from: string;

  /**
   * @param config - ConfigService; must have `RESEND_API_KEY` and `EMAIL_FROM`.
   *                 `RESEND_TEMPLATE_*` vars are optional (falls back to inline HTML).
   */
  constructor(private readonly config: ConfigService) {
    super();
    this.client = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = this.config.getOrThrow<string>('EMAIL_FROM');
  }

  /** {@inheritDoc IEmailProvider.send} */
  async send(opts: SendEmailOptions): Promise<void> {
    const envKey = `RESEND_TEMPLATE_${opts.templateName.toUpperCase().replace(/-/g, '_')}`;
    const templateId = this.config.get<string>(envKey);
    const payload = templateId
      ? this.buildTemplatePayload(opts, templateId)
      : this.buildHtmlPayload(opts);

    const { error } = await this.client.emails.send(payload);

    if (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 0;
      const isPermanent = statusCode >= 400 && statusCode < 500 && statusCode !== 429;
      const msg = `ResendEmailProvider: delivery failed — ${error.message}`;
      throw isPermanent ? new PermanentEmailError(msg) : new Error(msg);
    }
  }

  /**
   * Builds a Resend payload using a dashboard-managed template.
   * Subject and HTML are defined in the template; only recipient,
   * sender, and variables are supplied here.
   */
  private buildTemplatePayload(
    opts: SendEmailOptions,
    templateId: string,
  ): Parameters<Resend['emails']['send']>[0] {
    const variables = Object.fromEntries(
      Object.entries(opts.data).map(([k, v]) => [k, String(v)]),
    ) as Record<string, string>;

    return {
      from: this.from,
      to: opts.to,
      template: { id: templateId, variables },
    };
  }

  /**
   * Builds a minimal inline-HTML payload used when no template ID is
   * configured (local dev without published Resend templates).
   */
  private buildHtmlPayload(opts: SendEmailOptions): Parameters<Resend['emails']['send']>[0] {
    const entries = Object.entries(opts.data)
      .map(([k, v]) => `<p><strong>${k}:</strong> ${String(v)}</p>`)
      .join('\n');

    return {
      from: this.from,
      to: opts.to,
      subject: opts.subject ?? opts.templateName,
      html: `<h2>${opts.templateName}</h2>\n${entries}`,
    };
  }
}
