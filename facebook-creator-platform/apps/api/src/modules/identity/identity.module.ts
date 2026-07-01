import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from './guards/roles.guard';
import { User } from './entities/user.entity';
import { IUserRepository } from './ports/user.repository.port';
import { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import { IIdentityProvider } from './ports/identity-provider.port';
import { MikroOrmUserRepository } from './repositories/mikro-orm-user.repository';
import { MikroOrmWorkspaceMemberRepository } from './repositories/mikro-orm-workspace-member.repository';
import { ClerkIdentityProvider } from './repositories/clerk-identity-provider';
import { ClerkWebhookController } from './webhooks/clerk-webhook.controller';
import { ClerkWebhookService } from './webhooks/clerk-webhook.service';

/**
 * Identity module: Clerk JWT authentication, user upsert, workspace RBAC guards,
 * and Clerk webhook receiver for user lifecycle sync.
 *
 * Repository ports (`IUserRepository`, `IWorkspaceMemberRepository`) are bound to
 * their MikroORM adapters here, keeping the service free of ORM imports.
 *
 * Exported guards (`ClerkAuthGuard`, `WorkspaceRolesGuard`) are consumed
 * by every other feature module to protect their routes.
 */
@Module({
  imports: [MikroOrmModule.forFeature([User])],
  controllers: [IdentityController, ClerkWebhookController],
  providers: [
    IdentityService,
    ClerkAuthGuard,
    WorkspaceRolesGuard,
    ClerkWebhookService,
    { provide: IUserRepository, useClass: MikroOrmUserRepository },
    { provide: IWorkspaceMemberRepository, useClass: MikroOrmWorkspaceMemberRepository },
    { provide: IIdentityProvider, useClass: ClerkIdentityProvider },
  ],
  exports: [IdentityService, ClerkAuthGuard, WorkspaceRolesGuard],
})
export class IdentityModule {}
