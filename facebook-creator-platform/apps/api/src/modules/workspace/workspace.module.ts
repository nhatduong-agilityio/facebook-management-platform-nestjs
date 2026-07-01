import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdentityModule } from '../identity/identity.module';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { IWorkspaceRepository } from './ports/workspace.repository.port';
import { IWorkspaceMemberWriteRepository } from './ports/workspace-member.repository.port';
import { MikroOrmWorkspaceRepository } from './repositories/mikro-orm-workspace.repository';
import { MikroOrmWorkspaceMemberRepository } from './repositories/mikro-orm-workspace-member.repository';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';

/**
 * Workspace module: workspace lifecycle (create, list, get), entity definitions
 * for `core.workspaces` and `core.workspace_members`, and their MikroORM adapters.
 *
 * Imports `IdentityModule` to consume `ClerkAuthGuard` on the controller routes.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Workspace, WorkspaceMember]),
    IdentityModule,
  ],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceService,
    { provide: IWorkspaceRepository, useClass: MikroOrmWorkspaceRepository },
    { provide: IWorkspaceMemberWriteRepository, useClass: MikroOrmWorkspaceMemberRepository },
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
