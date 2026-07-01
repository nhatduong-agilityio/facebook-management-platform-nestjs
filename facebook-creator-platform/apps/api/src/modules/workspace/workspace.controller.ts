import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto, WorkspaceResponseDto } from './dto/workspace.dto';
import type { User } from '../identity/entities/user.entity';
import { Workspace } from './entities/workspace.entity';

/**
 * Workspace CRUD endpoints. All routes require a valid Clerk JWT.
 */
@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /**
   * Creates a new workspace and sets the authenticated user as its owner.
   *
   * @param dto  - Workspace name and optional description.
   * @param user - Authenticated user injected by `@CurrentUser()`.
   * @returns The newly created workspace.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a workspace' })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async create(
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() user: User,
  ): Promise<WorkspaceResponseDto> {
    const result = await this.workspaceService.create(dto, user.id);
    return result.match(
      (ws) => this.toResponse(ws),
      (e) => {
        throw toHttpException(e);
      },
    );
  }

  /**
   * Lists all workspaces where the authenticated user holds any membership role.
   *
   * @param user - Authenticated user injected by `@CurrentUser()`.
   * @returns Array of workspaces (may be empty).
   */
  @Get()
  @ApiOperation({ summary: 'List workspaces for the current user' })
  @ApiOkResponse({ type: WorkspaceResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async list(@CurrentUser() user: User): Promise<WorkspaceResponseDto[]> {
    const result = await this.workspaceService.listForUser(user.id);
    return result.match(
      (list) => list.map((ws) => this.toResponse(ws)),
      (e) => {
        throw toHttpException(e);
      },
    );
  }

  /**
   * Returns a single workspace by id.
   *
   * Returns 404 when the workspace does not exist, is soft-deleted, or the
   * authenticated user is not a member (avoids information leakage).
   *
   * @param id   - UUID v7 of the workspace.
   * @param user - Authenticated user injected by `@CurrentUser()`.
   * @returns The workspace.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a workspace by id' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiNotFoundResponse({ description: 'Workspace not found or user is not a member' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  async getById(@Param('id') id: string, @CurrentUser() user: User): Promise<WorkspaceResponseDto> {
    const result = await this.workspaceService.getById(id, user.id);
    return result.match(
      (ws) => this.toResponse(ws),
      (e) => {
        throw toHttpException(e);
      },
    );
  }

  /** Maps a Workspace entity to the public response shape. */
  private toResponse(ws: Workspace): WorkspaceResponseDto {
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      description: ws.description,
      status: ws.status,
      ownerUserId: ws.ownerUserId,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    };
  }
}
