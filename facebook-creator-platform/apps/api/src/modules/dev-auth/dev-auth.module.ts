import { Module } from '@nestjs/common';
import { DevAuthService } from './dev-auth.service';
import { DevAuthController } from './dev-auth.controller';

/**
 * Development-only authentication module.
 *
 * Exposes `POST /dev-auth/token` — calls the Clerk Backend API with
 * `CLERK_SECRET_KEY` to retrieve a real Clerk JWT from the user's active
 * session (optionally via a JWT template configured in the Clerk Dashboard).
 * Use the returned token as `Authorization: Bearer <jwt>` in Postman.
 *
 * **Import this module only when `NODE_ENV !== 'production'`** (enforced in `AppModule`).
 */
@Module({
  controllers: [DevAuthController],
  providers: [DevAuthService],
})
export class DevAuthModule {}
