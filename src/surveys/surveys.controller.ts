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
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { SurveysService } from './surveys.service';
import { AnalyticsService } from './analytics.service';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  SurveyResponseDto,
  SurveyVersionResponseDto,
  AnalyticsQueryDto,
  SurveyAnalyticsDto,
  AnalyticsSummaryDto,
  AnalyticsFunnelDto,
  AnalyticsTrendsDto,
  QuestionAnalyticsDto,
  ExportQueryDto,
  ExportFormat,
  TextResponsesQueryDto,
  PaginatedTextResponsesDto,
} from './dto';
import { GetContext } from '../common/decorators/request-context.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import {
  PaginationQueryDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';
import { Survey } from './entities/survey.entity';
import { SurveyVersion } from './entities/survey-version.entity';

@ApiTags('surveys')
@ApiSecurity('user-id')
@Controller('surveys')
export class SurveysController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new survey' })
  @ApiResponse({
    status: 201,
    description: 'Survey created',
    type: SurveyResponseDto,
  })
  async create(
    @GetContext() ctx: RequestContext,
    @Body() dto: CreateSurveyDto,
  ): Promise<Survey> {
    return this.surveysService.create(ctx, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all surveys for tenant' })
  @ApiResponse({ status: 200, description: 'List of surveys' })
  async findAll(
    @GetContext() ctx: RequestContext,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<Survey>> {
    return this.surveysService.findAll(ctx, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a survey by ID' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Survey found',
    type: SurveyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async findOne(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<Survey> {
    return this.surveysService.findOne(ctx, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Survey updated',
    type: SurveyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async update(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateSurveyDto,
  ): Promise<Survey> {
    return this.surveysService.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({ status: 204, description: 'Survey deleted' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async remove(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.surveysService.remove(ctx, id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a survey (create new version)' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Survey published',
    type: SurveyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot publish survey' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async publish(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<Survey> {
    return this.surveysService.publish(ctx, id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'List of versions',
    type: [SurveyVersionResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getVersions(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<SurveyVersion[]> {
    return this.surveysService.getVersions(ctx, id);
  }

  @Get(':id/versions/:versionId')
  @ApiOperation({ summary: 'Get a specific version of a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiParam({ name: 'versionId', description: 'Version ID' })
  @ApiResponse({
    status: 200,
    description: 'Version found',
    type: SurveyVersionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getVersion(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ): Promise<SurveyVersion> {
    return this.surveysService.getVersion(ctx, id, versionId);
  }

  @Get(':id/runtime')
  @ApiOperation({ summary: 'Get the active published version for respondents' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Runtime version',
    type: SurveyVersionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'No published version' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getRuntime(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<SurveyVersion> {
    return this.surveysService.getRuntime(ctx, id);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate a survey schema and logic without saving' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async validateSurvey(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
  ): Promise<{
    schemaValid: boolean;
    logicValid: boolean;
    schemaErrors: unknown[];
    schemaWarnings: unknown[];
    logicErrors: string[];
  }> {
    return this.surveysService.validateSurvey(ctx, id);
  }

  @Post(':id/evaluate-logic')
  @ApiOperation({ summary: 'Evaluate logic rules for given answers' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Logic evaluation result',
  })
  @ApiResponse({ status: 400, description: 'No published version' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async evaluateLogic(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { answers: Record<string, unknown> },
  ): Promise<{
    visibleQuestions: string[];
    hiddenQuestions: string[];
    visiblePages: string[];
    hiddenPages: string[];
    requiredQuestions: string[];
    calculatedValues: Record<string, unknown>;
    validationErrors: Record<string, string>;
  }> {
    return this.surveysService.evaluateLogic(ctx, id, body.answers);
  }

  // ========================================
  // ANALYTICS ENDPOINTS
  // ========================================

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get complete analytics for a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Complete survey analytics',
    type: SurveyAnalyticsDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getAnalytics(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<SurveyAnalyticsDto> {
    return this.analyticsService.getAnalytics(ctx, id, query);
  }

  @Get(':id/analytics/summary')
  @ApiOperation({ summary: 'Get summary statistics for a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Summary statistics',
    type: AnalyticsSummaryDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getAnalyticsSummary(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsSummaryDto> {
    return this.analyticsService.getSummary(ctx, id, query);
  }

  @Get(':id/analytics/funnel')
  @ApiOperation({ summary: 'Get completion funnel data for a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Funnel data',
    type: AnalyticsFunnelDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getAnalyticsFunnel(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsFunnelDto> {
    return this.analyticsService.getFunnel(ctx, id, query);
  }

  @Get(':id/analytics/trends')
  @ApiOperation({ summary: 'Get response trends over time for a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Trends data',
    type: AnalyticsTrendsDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getAnalyticsTrends(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsTrendsDto> {
    return this.analyticsService.getTrends(ctx, id, query);
  }

  @Get(':id/analytics/questions')
  @ApiOperation({ summary: 'Get per-question analytics for a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({
    status: 200,
    description: 'Question analytics',
    type: [QuestionAnalyticsDto],
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getAnalyticsQuestions(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<QuestionAnalyticsDto[]> {
    return this.analyticsService.getQuestionAnalytics(ctx, id, query);
  }

  @Get(':id/analytics/questions/:questionId/responses')
  @ApiOperation({ summary: 'Get paginated text responses for a specific question' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiParam({ name: 'questionId', description: 'Question ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search text in responses' })
  @ApiResponse({
    status: 200,
    description: 'Paginated text responses',
    type: PaginatedTextResponsesDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getQuestionTextResponses(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Query() query: TextResponsesQueryDto,
  ): Promise<PaginatedTextResponsesDto> {
    return this.analyticsService.getTextResponses(ctx, id, questionId, query);
  }

  @Get(':id/analytics/export')
  @ApiOperation({ summary: 'Export analytics data' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiQuery({ name: 'format', enum: ExportFormat, required: false })
  @ApiResponse({
    status: 200,
    description: 'Exported data file',
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async exportAnalytics(
    @GetContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: ExportQueryDto,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const result = await this.analyticsService.exportAnalytics(
      ctx,
      id,
      query,
      query.format || ExportFormat.JSON,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  }
}
