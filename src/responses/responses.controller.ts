import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { ResponsesService } from './responses.service';
import { StartResponseDto, UpdateResponseDto } from './dto/create-response.dto';
import { GetContext } from '../common/decorators/request-context.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import {
  PaginationQueryDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';
import { Response } from './entities/response.entity';
import { ResponseStatus } from '../common/constants/status.constants';

@ApiTags('responses')
@ApiSecurity('user-id')
@Controller('responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start a new response session' })
  @ApiResponse({ status: 201, description: 'Response started' })
  async start(
    @GetContext() ctx: RequestContext,
    @Body() dto: StartResponseDto,
  ): Promise<Response> {
    return this.responsesService.start(ctx, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all responses for tenant' })
  @ApiQuery({
    name: 'surveyId',
    required: false,
    description: 'Filter by survey ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ResponseStatus,
    description: 'Filter by status',
  })
  @ApiResponse({ status: 200, description: 'List of responses' })
  async findAll(
    @GetContext() ctx: RequestContext,
    @Query()
    query: PaginationQueryDto & { surveyId?: string; status?: ResponseStatus },
  ): Promise<PaginatedResponseDto<Response>> {
    return this.responsesService.findAll(ctx, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a response by ID' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiResponse({ status: 200, description: 'Response found' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async findOne(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<Response> {
    return this.responsesService.findOne(ctx, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update/save partial response' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiResponse({ status: 200, description: 'Response updated' })
  @ApiResponse({ status: 400, description: 'Cannot update completed response' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async update(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateResponseDto,
  ): Promise<Response> {
    return this.responsesService.update(ctx, id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete and submit response' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiResponse({ status: 200, description: 'Response completed' })
  @ApiResponse({ status: 400, description: 'Response already completed' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async complete(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<Response> {
    return this.responsesService.complete(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a response' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiResponse({ status: 204, description: 'Response deleted' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async remove(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.responsesService.remove(ctx, id);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate a response without completing it' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async validate(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<{
    valid: boolean;
    errors: unknown[];
    missingRequired: string[];
    visibleQuestions: string[];
    hiddenQuestions: string[];
    requiredQuestions: string[];
  }> {
    return this.responsesService.validate(ctx, id);
  }

  @Get(':id/logic')
  @ApiOperation({ summary: 'Evaluate logic rules for current response state' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiResponse({ status: 200, description: 'Logic evaluation result' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async evaluateLogic(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<{
    visibleQuestions: string[];
    hiddenQuestions: string[];
    visiblePages: string[];
    hiddenPages: string[];
    requiredQuestions: string[];
    calculatedValues: Record<string, unknown>;
  }> {
    return this.responsesService.evaluateLogic(ctx, id);
  }
}
