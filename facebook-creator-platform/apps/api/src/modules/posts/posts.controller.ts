import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../identity/guards/clerk-auth.guard';
import { WorkspaceRolesGuard } from '../identity/guards/roles.guard';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Roles } from '../identity/decorators/roles.decorator';
import { toHttpException } from '../../common/http/to-http-exception';
import { PostsService } from './posts.service';
import {
  CreatePostDto,
  ListPostsQueryDto,
  PostResponseDto,
  PostsPageDto,
  UpdatePostDto,
} from './dto/post.dto';
import { UpdatePostStatusDto } from './dto/update-post-status.dto';
import type { User } from '../identity/entities/user.entity';
import type { Post as PostEntity } from './entities/post.entity';

/** Maps a `Post` entity to the safe API response shape. */
function toDto(post: PostEntity): PostResponseDto {
  return {
    id: post.id,
    workspaceId: post.workspace.id,
    facebookAccountId: post.facebookAccount?.id,
    createdByUserId: post.createdByUserId,
    title: post.title,
    content: post.content,
    mediaUrl: post.mediaUrl,
    status: post.status,
    facebookGraphPostId: post.facebookGraphPostId,
    scheduledAt: post.scheduledAt,
    publishedAt: post.publishedAt,
    lastError: post.lastError,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

/**
 * Post CRUD endpoints.
 *
 * All routes are scoped to a workspace (`/workspaces/:workspaceId/posts`).
 * Write operations require Owner or Editor role; reads are available to all workspace roles.
 */
@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('workspaces/:workspaceId/posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /**
   * Creates a new post in `draft` status within the workspace.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param user        - Authenticated user (injected by `ClerkAuthGuard`).
   * @param dto         - Validated create payload.
   */
  @Post()
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new draft post' })
  @ApiCreatedResponse({ type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient workspace role (Owner or Editor required)' })
  @ApiConflictResponse({ description: 'Workspace has reached its plan post quota (PLAN_LIMIT_EXCEEDED)' })
  async createPost(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    const result = await this.postsService.createPost(workspaceId, user.id, dto);
    return result.match(
      (post) => toDto(post),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Returns a page of active (non-deleted) posts for the workspace, newest first.
   *
   * Supports keyset pagination: pass `nextCursor` from the previous response
   * as `?cursor=<value>` to advance pages. Default page size is 50.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param query       - Validated pagination parameters (`limit`, `cursor`).
   */
  @Get()
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor', 'viewer')
  @ApiOperation({ summary: 'List posts in the workspace (paginated, newest first)' })
  @ApiOkResponse({ type: PostsPageDto })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (1–100, default 50)' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Keyset cursor from previous response' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Not a member of this workspace' })
  async listPosts(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListPostsQueryDto,
  ): Promise<PostsPageDto> {
    const result = await this.postsService.listPosts(workspaceId, query);
    return result.match(
      (page) => ({ data: page.data.map(toDto), nextCursor: page.nextCursor }),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Returns a single post by id, scoped to the workspace.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   */
  @Get(':postId')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor', 'viewer')
  @ApiOperation({ summary: 'Get a post by id' })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Not a member of this workspace' })
  @ApiNotFoundResponse({ description: 'Post not found or soft-deleted' })
  async getPost(
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
  ): Promise<PostResponseDto> {
    const result = await this.postsService.getPost(workspaceId, postId);
    return result.match(
      (post) => toDto(post),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Updates mutable fields on a `draft` or `scheduled` post.
   *
   * Rejects updates on `publishing` or `published` posts with 403 FORBIDDEN.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   * @param dto         - Fields to update.
   */
  @Patch(':postId')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @ApiOperation({ summary: 'Update a draft or scheduled post' })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient role or post is not editable' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  async updatePost(
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const result = await this.postsService.updatePost(workspaceId, postId, dto);
    return result.match(
      (post) => toDto(post),
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Soft-deletes a post. The post is immediately hidden from list/get responses.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   */
  @Delete(':postId')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a post' })
  @ApiNoContentResponse({ description: 'Post soft-deleted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient workspace role' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  async deletePost(
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
  ): Promise<void> {
    const result = await this.postsService.deletePost(workspaceId, postId);
    result.match(
      () => undefined,
      (e) => { throw toHttpException(e); },
    );
  }

  /**
   * Drives a guarded status transition on a post.
   *
   * Enforces the state machine: `draft → scheduled → publishing → published | failed`.
   * Illegal transitions return 409 Conflict. BR-F06 violations (past `scheduledAt`)
   * return 422 Unprocessable Entity.
   *
   * @param workspaceId - UUID of the owning workspace.
   * @param postId      - UUID v7 of the post.
   * @param dto         - Target status and any required auxiliary fields.
   */
  @Patch(':postId/status')
  @UseGuards(WorkspaceRolesGuard)
  @Roles('owner', 'editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition post status via the state machine' })
  @ApiOkResponse({ type: PostResponseDto, description: 'Post with updated status' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiForbiddenResponse({ description: 'Insufficient workspace role' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiConflictResponse({ description: 'Transition not allowed from current status (INVALID_STATE_TRANSITION)' })
  async transitionStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
    @Body() dto: UpdatePostStatusDto,
  ): Promise<PostResponseDto> {
    const result = await this.postsService.transitionStatus(workspaceId, postId, dto);
    return result.match(
      (post) => toDto(post),
      (e) => { throw toHttpException(e); },
    );
  }
}
