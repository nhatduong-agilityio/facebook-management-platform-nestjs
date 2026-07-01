import { ApiProperty } from '@nestjs/swagger';

/**
 * Response body for `GET /workspaces/:workspaceId/facebook/connect-url`.
 *
 * The client should redirect the browser to `url`. Persist `state` locally
 * (e.g. in session or query-param round-trip) and compare it to the `state`
 * returned by Facebook's callback to prevent CSRF attacks.
 */
export class ConnectUrlResponseDto {
  /**
   * Full Facebook OAuth authorization URL.
   * Redirect the user here to initiate page connection.
   */
  @ApiProperty({
    example: 'https://www.facebook.com/v21.0/dialog/oauth?client_id=...',
    description: 'Facebook OAuth authorization URL — redirect the user here.',
  })
  url!: string;

  /**
   * CSRF state token (`base64url(payload).<hmac>`).
   * Must be verified against the `state` query-param in the OAuth callback.
   */
  @ApiProperty({
    example: 'eyJ3b3Jrc3BhY2VJZCI6Ii4uLiJ9.abcdef1234',
    description: 'CSRF state token. Verify this in the OAuth callback.',
  })
  state!: string;
}
