import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISlackProvider } from '../ports/slack.provider.port';

/** Timeout for outbound Slack webhook calls (ms). */
const TIMEOUT_MS = 5_000;

/**
 * `ISlackProvider` implementation that posts to an incoming Slack webhook URL.
 *
 * If `SLACK_WEBHOOK_URL` is not set, calls are silently skipped — Slack alerting is
 * optional per environment. A missing webhook never blocks notification persistence.
 */
@Injectable()
export class SlackWebhookProvider extends ISlackProvider {
  private readonly webhookUrl: string | undefined;

  /** @param config - ConfigService; reads optional `SLACK_WEBHOOK_URL`. */
  constructor(private readonly config: ConfigService) {
    super();
    this.webhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');
  }

  /** {@inheritDoc ISlackProvider.sendAlert} */
  async sendAlert(message: string): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        /* Slack errors are non-critical — log but never throw */
        console.warn(`SlackWebhookProvider: unexpected status ${res.status}`);
      }
    } catch {
      /* Network failure — non-critical, swallow silently */
    }
  }
}
