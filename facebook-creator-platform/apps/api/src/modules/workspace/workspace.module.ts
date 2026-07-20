import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityModule } from '../identity/identity.module';
import { PostsModule } from '../posts/posts.module';
import { FacebookModule } from '../facebook/facebook.module';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Invitation } from './entities/invitation.entity';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import { IInvitationRepository } from './ports/invitation.repository.port';
import { MikroOrmWorkspaceRepository } from './repositories/mikro-orm-workspace.repository';
import { MikroOrmWorkspaceMemberRepository } from './repositories/mikro-orm-workspace-member.repository';
import { MikroOrmInvitationRepository } from './repositories/mikro-orm-invitation.repository';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { InternalWorkspaceController } from './controllers/internal-workspace.controller';
import { InternalInvitationController } from './controllers/internal-invitation.controller';
import { WorkspacePurgeJob } from './jobs/workspace-purge.job';

/**
 * Workspace module: workspace lifecycle, member management, invitations, and deletion.
 *
 * Imports:
 * - `IdentityModule`  — `ClerkAuthGuard` + `WorkspaceRolesGuard` on controller routes.
 * - `PostsModule`     — exports `IPostRepository` for cascade soft-delete in `deleteWorkspace`.
 * - `FacebookModule`  — exports `IFacebookAccountRepository` for cascade soft-delete.
 *
 * Billing subscription cancellation is handled via choreography: `services/billing` consumes
 * `WorkspaceDeletedEvent` and cancels the subscription independently (ADR-109 Fix 4).
 *
 * `IEventBus` is resolved from the global `RabbitmqModule` (wired in T2.6).
 * `ScheduleModule` provides `@Cron` support for `WorkspacePurgeJob`.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Workspace, WorkspaceMember, Invitation]),
    IdentityModule,
    PostsModule,
    FacebookModule,
  ],
  controllers: [WorkspaceController, InternalWorkspaceController, InternalInvitationController],
  providers: [
    WorkspaceService,
    { provide: IWorkspaceRepository, useClass: MikroOrmWorkspaceRepository },
    { provide: IWorkspaceMemberRepository, useClass: MikroOrmWorkspaceMemberRepository },
    { provide: IInvitationRepository, useClass: MikroOrmInvitationRepository },
    WorkspacePurgeJob,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
