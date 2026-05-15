import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
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
import { AnalyticsService } from './analytics.service';
import {
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

@ApiTags('analytics')
@ApiSecurity('user-id')
@Controller('surveys')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

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
    @Param('id', ParseUUIDPipe) id: string,
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
    @Param('id', ParseUUIDPipe) id: string,
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
    @Param('id', ParseUUIDPipe) id: string,
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
    @Param('id', ParseUUIDPipe) id: string,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<QuestionAnalyticsDto[]> {
    return this.analyticsService.getQuestionAnalytics(ctx, id, query);
  }

  @Get(':id/analytics/questions/:questionId/responses')
  @ApiOperation({
    summary: 'Get paginated text responses for a specific question',
  })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiParam({ name: 'questionId', description: 'Question ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (max 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search text in responses',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated text responses',
    type: PaginatedTextResponsesDto,
  })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getQuestionTextResponses(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId') questionId: string,
    @Query() query: TextResponsesQueryDto,
  ): Promise<PaginatedTextResponsesDto> {
    return this.analyticsService.getTextResponses(ctx, id, questionId, query);
  }

  @Get(':id/analytics/export')
  @ApiOperation({ summary: 'Export analytics data' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiQuery({ name: 'format', enum: ExportFormat, required: false })
  @ApiResponse({ status: 200, description: 'Exported data file' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async exportAnalytics(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.data);
  }
}
