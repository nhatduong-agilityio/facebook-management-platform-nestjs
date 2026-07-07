/**
 * Port: outbound Slack notification contract.
 *
 * Bound to `SlackWebhookProvider` in `NotificationModule`.
 * Only used when the orchestrator determines a Slack alert should fire.
 */
export abstract class ISlackProvider {
  /**
   * Sends a text message to the configured Slack webhook.
   *
   * @param message - Plain-text message to post. No PII — tokens and emails must
   *                  be stripped before calling.
   */
  abstract sendAlert(message: string): Promise<void>;
}
