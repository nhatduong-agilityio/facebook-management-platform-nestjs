/**
 * Profile data returned by the external identity provider on first sign-in.
 *
 * Fields are named after platform concepts, not Clerk API shapes, so the
 * service remains provider-agnostic.
 */
export interface ExternalUserProfile {
  /** Primary verified email address. */
  email: string;
  /** Given name, if the provider supplied one. */
  firstName?: string;
  /** Family name, if the provider supplied one. */
  lastName?: string;
  /** Avatar image URL, if the provider supplied one. */
  avatarUrl?: string;
}

/**
 * Port (outbound): fetches a user's profile from the external identity provider.
 *
 * Isolating this call behind a port keeps the service free of any Clerk-specific
 * imports and makes the auth provider swappable without touching application logic.
 */
export abstract class IIdentityProvider {
  /**
   * Fetches the profile for a user identified by their provider-issued id.
   *
   * @param providerUserId - The user's id in the external identity system (Clerk `sub`).
   * @returns Resolved profile data. Throws on network or provider error.
   */
  abstract getProfile(providerUserId: string): Promise<ExternalUserProfile>;
}
