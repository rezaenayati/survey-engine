import { Injectable, BadRequestException } from '@nestjs/common';
import { SurveysService } from '../surveys/surveys.service';
import { RequestContext } from '../common/interfaces/request-context.interface';
import { AggregationService } from './aggregation.service';
import { QuestionAnalyticsService } from './question-analytics.service';
import { ExportService } from './export.service';
import {
  AnalyticsQueryDto,
  SurveyAnalyticsDto,
  AnalyticsSummaryDto,
  AnalyticsFunnelDto,
  AnalyticsTrendsDto,
  QuestionAnalyticsDto,
  VersionMode,
  TextResponsesQueryDto,
  PaginatedTextResponsesDto,
} from './dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly aggregationService: AggregationService,
    private readonly questionAnalyticsService: QuestionAnalyticsService,
    private readonly exportService: ExportService,
  ) {}

  async getAnalytics(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
  ): Promise<SurveyAnalyticsDto> {
    const survey = await this.surveysService.findOne(ctx, surveyId);
    this.surveysService.assertOwner(survey, ctx);

    if (query.versionMode === VersionMode.SPECIFIC && !query.versionId) {
      throw new BadRequestException(
        'versionId is required when versionMode is "specific"',
      );
    }

    const versions = await this.questionAnalyticsService.getRelevantVersions(
      surveyId,
      query,
    );
    const versionNumbers = versions.map((v) => v.versionNumber);
    const baseQuery = this.aggregationService.buildBaseQuery(
      ctx,
      surveyId,
      query,
    );

    const [summary, funnel, trends, questions] = await Promise.all([
      this.aggregationService.calculateSummaryDB(
        baseQuery.clone(),
        versionNumbers,
      ),
      this.aggregationService.calculateFunnelDB(
        baseQuery.clone(),
        query.staleDays || 7,
      ),
      this.aggregationService.calculateTrendsDB(baseQuery.clone()),
      this.questionAnalyticsService.calculateQuestionAnalyticsDB(
        ctx,
        surveyId,
        query,
        versions,
      ),
    ]);

    return {
      surveyId,
      surveyName: survey.name,
      summary,
      funnel,
      trends,
      questions,
      generatedAt: new Date().toISOString(),
      appliedFilters: this.aggregationService.buildAppliedFilters(query),
    };
  }

  async getSummary(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsSummaryDto> {
    await this.verifySurveyExists(ctx, surveyId);
    const versions = await this.questionAnalyticsService.getRelevantVersions(
      surveyId,
      query,
    );
    const baseQuery = this.aggregationService.buildBaseQuery(
      ctx,
      surveyId,
      query,
    );
    return this.aggregationService.calculateSummaryDB(
      baseQuery,
      versions.map((v) => v.versionNumber),
    );
  }

  async getFunnel(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsFunnelDto> {
    await this.verifySurveyExists(ctx, surveyId);
    const baseQuery = this.aggregationService.buildBaseQuery(
      ctx,
      surveyId,
      query,
    );
    return this.aggregationService.calculateFunnelDB(
      baseQuery,
      query.staleDays || 7,
    );
  }

  async getTrends(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsTrendsDto> {
    await this.verifySurveyExists(ctx, surveyId);
    const baseQuery = this.aggregationService.buildBaseQuery(
      ctx,
      surveyId,
      query,
    );
    return this.aggregationService.calculateTrendsDB(baseQuery);
  }

  async getQuestionAnalytics(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
  ): Promise<QuestionAnalyticsDto[]> {
    await this.verifySurveyExists(ctx, surveyId);
    const versions = await this.questionAnalyticsService.getRelevantVersions(
      surveyId,
      query,
    );
    return this.questionAnalyticsService.calculateQuestionAnalyticsDB(
      ctx,
      surveyId,
      query,
      versions,
    );
  }

  async exportAnalytics(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
    format: 'json' | 'csv',
  ): Promise<{ data: string; contentType: string; filename: string }> {
    const analytics = await this.getAnalytics(ctx, surveyId, query);

    if (format === 'csv') {
      return {
        data: this.exportService.convertToCSV(analytics),
        contentType: 'text/csv',
        filename: `survey-analytics-${surveyId}-${Date.now()}.csv`,
      };
    }

    return {
      data: JSON.stringify(analytics, null, 2),
      contentType: 'application/json',
      filename: `survey-analytics-${surveyId}-${Date.now()}.json`,
    };
  }

  async getTextResponses(
    ctx: RequestContext,
    surveyId: string,
    questionId: string,
    query: TextResponsesQueryDto,
  ): Promise<PaginatedTextResponsesDto> {
    await this.verifySurveyExists(ctx, surveyId);
    return this.questionAnalyticsService.getTextResponses(
      ctx,
      surveyId,
      questionId,
      query,
    );
  }

  private async verifySurveyExists(
    ctx: RequestContext,
    surveyId: string,
  ): Promise<void> {
    await this.surveysService.findOne(ctx, surveyId);
  }
}
