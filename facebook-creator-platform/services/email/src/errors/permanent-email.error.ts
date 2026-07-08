/**
 * Thrown by `IEmailProvider` implementations when the delivery failure is
 * permanent — i.e., retrying the same message will never succeed.
 *
 * Examples: Resend 4xx responses (invalid recipient, domain not verified,
 * invalid API key). Excludes 429 (rate-limited), which is transient.
 *
 * Consumers catch this and return `Nack(false)` to route the message to the
 * DLQ without requeueing, stopping the infinite retry loop.
 */
export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentEmailError';
  }
}
