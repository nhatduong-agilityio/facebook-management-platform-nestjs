import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityModule } from '../identity/identity.module';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Invitation } from './entities/invitation.entity';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberRepository } from './ports/workspace-member.repository.port';
import { IInvitationRepository } from './ports/invitation.repository.port';
import { IEventBus } from '../../common/events/event-bus.port';
import { NoopEventBus } from '../../common/events/noop-event-bus';
import { MikroOrmWorkspaceRepository } from './repositories/mikro-orm-workspace.repository';
import { MikroOrmWorkspaceMemberRepository } from './repositories/mikro-orm-workspace-member.repository';
import { MikroOrmInvitationRepository } from './repositories/mikro-orm-invitation.repository';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';

/**
 * Workspace module: workspace lifecycle, member management, and invitations.
 *
 * Imports `IdentityModule` to consume `ClerkAuthGuard` and `WorkspaceRolesGuard`
 * on controller routes.
 *
 * `IEventBus` is bound to `NoopEventBus` until T2.6 wires the RabbitMQ publisher.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Workspace, WorkspaceMember, Invitation]),
    IdentityModule,
  ],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceService,
    { provide: IWorkspaceRepository, useClass: MikroOrmWorkspaceRepository },
    { provide: IWorkspaceMemberRepository, useClass: MikroOrmWorkspaceMemberRepository },
    { provide: IInvitationRepository, useClass: MikroOrmInvitationRepository },
    { provide: IEventBus, useClass: NoopEventBus },
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
