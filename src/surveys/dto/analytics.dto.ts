import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsDateString,
  IsUUID,
  IsEnum,
  IsArray,
  IsString,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ResponseStatus } from '../../common/constants/status.constants';

/**
 * Version mode for analytics
 */
export enum VersionMode {
  COMBINED = 'combined',
  SPECIFIC = 'specific',
}

/**
 * Operators for answer filtering
 */
export enum FilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  IN = 'in',
  GT = 'gt',
  LT = 'lt',
  GTE = 'gte',
  LTE = 'lte',
}

/**
 * Filter for cross-question analytics
 * Example: Show analytics for users who answered "Yes" to question "q3"
 */
export class AnswerFilterDto {
  @ApiProperty({ description: 'Question ID to filter by' })
  @IsString()
  questionId: string;

  @ApiProperty({ description: 'Filter operator', enum: FilterOperator })
  @IsEnum(FilterOperator)
  operator: FilterOperator;

  @ApiProperty({ description: 'Value to compare against (string, number, or array for "in" operator)' })
  value: string | number | string[];
}

/**
 * Query parameters for analytics endpoints
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Start date for filtering (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by specific survey version (required if versionMode is "specific")' })
  @IsOptional()
  @IsUUID()
  versionId?: string;

  @ApiPropertyOptional({ description: 'Filter by response status', enum: ResponseStatus })
  @IsOptional()
  @IsEnum(ResponseStatus)
  status?: ResponseStatus;

  @ApiPropertyOptional({
    description: 'Version handling mode: "combined" merges all versions, "specific" uses one version',
    enum: VersionMode,
    default: VersionMode.COMBINED,
  })
  @IsOptional()
  @IsEnum(VersionMode)
  versionMode?: VersionMode = VersionMode.COMBINED;

  @ApiPropertyOptional({
    description: 'Filter by specific respondent IDs (for external segmentation)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  respondentIds?: string[];

  @ApiPropertyOptional({
    description: 'Cross-question filters (e.g., show analytics for users who answered "Yes" to Q3)',
    type: [AnswerFilterDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerFilterDto)
  answerFilters?: AnswerFilterDto[];

  @ApiPropertyOptional({
    description: 'Number of days of inactivity to consider a response "stale" (default: 7)',
    default: 7,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  staleDays?: number = 7;
}

/**
 * Summary statistics for a survey
 */
export class AnalyticsSummaryDto {
  @ApiProperty({ description: 'Total number of responses' })
  totalResponses: number;

  @ApiProperty({ description: 'Number of completed responses' })
  completedResponses: number;

  @ApiProperty({ description: 'Completion rate (0-100)' })
  completionRate: number;

  @ApiProperty({ description: 'Average completion time in seconds' })
  avgCompletionTime: number;

  @ApiProperty({ description: 'Median completion time in seconds' })
  medianCompletionTime: number;

  @ApiProperty({ description: 'Responses grouped by status' })
  responsesByStatus: Record<string, number>;

  @ApiProperty({ description: 'Number of responses today' })
  responsesToday: number;

  @ApiProperty({ description: 'Number of responses this week' })
  responsesThisWeek: number;

  @ApiPropertyOptional({ description: 'Versions included in this analysis' })
  versionsIncluded?: number[];
}

/**
 * Completion funnel data - shows ALL status categories explicitly
 */
export class AnalyticsFunnelDto {
  @ApiProperty({ description: 'Total number of responses (all statuses)' })
  total: number;

  @ApiProperty({ description: 'Number of just-started responses (no answers yet)' })
  started: number;

  @ApiProperty({ description: 'Number of in-progress responses (partial answers)' })
  inProgress: number;

  @ApiProperty({ description: 'Number of completed responses (fully submitted)' })
  completed: number;

  @ApiProperty({ description: 'Number of explicitly abandoned responses' })
  abandoned: number;

  @ApiProperty({ description: 'Active responses not yet finished (started + inProgress)' })
  activeResponses: number;

  @ApiProperty({ description: 'Stale responses (in_progress with no activity for X days)' })
  staleResponses: number;

  @ApiProperty({ description: 'Completion rate (completed / total * 100)' })
  completionRate: number;

  @ApiProperty({ description: 'Drop-off rate ((total - completed) / total * 100)' })
  dropOffRate: number;

  @ApiProperty({ description: 'Abandonment rate (abandoned / total * 100)' })
  abandonmentRate: number;
}

/**
 * Time trend data point
 */
export class TrendDataPointDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Number of responses' })
  count: number;

  @ApiProperty({ description: 'Number of completed responses' })
  completed: number;
}

/**
 * Response trends over time
 */
export class AnalyticsTrendsDto {
  @ApiProperty({ description: 'Daily response counts', type: [TrendDataPointDto] })
  daily: TrendDataPointDto[];

  @ApiProperty({ description: 'Weekly response counts', type: [TrendDataPointDto] })
  weekly: TrendDataPointDto[];
}

/**
 * Word frequency entry for text analysis
 */
export class WordFrequencyDto {
  @ApiProperty({ description: 'The word' })
  word: string;

  @ApiProperty({ description: 'Number of occurrences' })
  count: number;
}

/**
 * Choice distribution entry - with legacy option support
 */
export class ChoiceDistributionDto {
  @ApiProperty({ description: 'Choice value' })
  value: string;

  @ApiProperty({ description: 'Choice label/text' })
  label: string;

  @ApiProperty({ description: 'Number of selections' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;

  @ApiPropertyOptional({
    description: 'True if this option was removed in newer versions (legacy option)',
  })
  isLegacy?: boolean;

  @ApiPropertyOptional({
    description: 'Version numbers where this option exists',
    type: [Number],
  })
  fromVersions?: number[];
}

/**
 * Analytics for a single question
 */
export class QuestionAnalyticsDto {
  @ApiProperty({ description: 'Question ID/name' })
  questionId: string;

  @ApiProperty({ description: 'Question type' })
  questionType: string;

  @ApiProperty({ description: 'Question title' })
  questionTitle: string;

  @ApiProperty({ description: 'Total number of answers' })
  totalAnswers: number;

  @ApiProperty({ description: 'Number of skipped/empty responses' })
  skipped: number;

  @ApiPropertyOptional({
    description: 'Distribution for choice questions',
    type: [ChoiceDistributionDto],
  })
  distribution?: ChoiceDistributionDto[];

  @ApiPropertyOptional({ description: 'Average value for numeric questions' })
  average?: number;

  @ApiPropertyOptional({ description: 'Median value for numeric questions' })
  median?: number;

  @ApiPropertyOptional({ description: 'Standard deviation for numeric questions' })
  stdDeviation?: number;

  @ApiPropertyOptional({ description: 'Minimum value for numeric questions' })
  min?: number;

  @ApiPropertyOptional({ description: 'Maximum value for numeric questions' })
  max?: number;

  @ApiPropertyOptional({ description: 'Value distribution for rating/scale questions' })
  valueDistribution?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Word frequency for text questions (based on sample)',
    type: [WordFrequencyDto],
  })
  wordFrequency?: WordFrequencyDto[];

  @ApiPropertyOptional({ description: 'Average text length for text questions' })
  avgTextLength?: number;

  @ApiPropertyOptional({
    description: 'Number of responses analyzed for word frequency (may be sampled)',
  })
  sampleSize?: number;

  @ApiPropertyOptional({
    description: 'Recent text responses preview (last 10)',
    type: [String],
  })
  recentResponses?: string[];

  @ApiPropertyOptional({ description: 'True count for boolean questions' })
  trueCount?: number;

  @ApiPropertyOptional({ description: 'False count for boolean questions' })
  falseCount?: number;

  @ApiPropertyOptional({
    description: 'True if this question was removed in newer versions',
  })
  isLegacy?: boolean;

  @ApiPropertyOptional({
    description: 'Version numbers where this question exists',
    type: [Number],
  })
  fromVersions?: number[];
}

/**
 * Applied filters information
 */
export class AppliedFiltersDto {
  @ApiPropertyOptional({ description: 'Date range filter' })
  dateRange?: { startDate?: string; endDate?: string };

  @ApiPropertyOptional({ description: 'Version mode used' })
  versionMode?: VersionMode;

  @ApiPropertyOptional({ description: 'Specific version ID if applicable' })
  versionId?: string;

  @ApiPropertyOptional({ description: 'Number of respondent IDs filtered' })
  respondentIdsCount?: number;

  @ApiPropertyOptional({ description: 'Answer filters applied', type: [AnswerFilterDto] })
  answerFilters?: AnswerFilterDto[];

  @ApiPropertyOptional({ description: 'Response status filter' })
  status?: ResponseStatus;
}

/**
 * Complete survey analytics response
 */
export class SurveyAnalyticsDto {
  @ApiProperty({ description: 'Survey ID' })
  surveyId: string;

  @ApiProperty({ description: 'Survey name' })
  surveyName: string;

  @ApiProperty({ description: 'Summary statistics', type: AnalyticsSummaryDto })
  summary: AnalyticsSummaryDto;

  @ApiProperty({ description: 'Completion funnel', type: AnalyticsFunnelDto })
  funnel: AnalyticsFunnelDto;

  @ApiProperty({ description: 'Response trends', type: AnalyticsTrendsDto })
  trends: AnalyticsTrendsDto;

  @ApiProperty({ description: 'Per-question analytics', type: [QuestionAnalyticsDto] })
  questions: QuestionAnalyticsDto[];

  @ApiProperty({ description: 'Analytics generation timestamp' })
  generatedAt: string;

  @ApiPropertyOptional({ description: 'Filters that were applied', type: AppliedFiltersDto })
  appliedFilters?: AppliedFiltersDto;
}

/**
 * Export format options
 */
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class ExportQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Export format',
    enum: ExportFormat,
    default: ExportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat = ExportFormat.JSON;
}

/**
 * Query for paginated text responses
 */
export class TextResponsesQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search/filter text responses' })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Single text response item
 */
export class TextResponseItemDto {
  @ApiProperty({ description: 'Response ID' })
  responseId: string;

  @ApiProperty({ description: 'The text answer' })
  text: string;

  @ApiProperty({ description: 'When the response was submitted' })
  submittedAt: string;

  @ApiPropertyOptional({ description: 'Respondent ID if available' })
  respondentId?: string;
}

/**
 * Paginated text responses result
 */
export class PaginatedTextResponsesDto {
  @ApiProperty({ description: 'Question ID' })
  questionId: string;

  @ApiProperty({ description: 'Question title' })
  questionTitle: string;

  @ApiProperty({ description: 'Text responses', type: [TextResponseItemDto] })
  items: TextResponseItemDto[];

  @ApiProperty({ description: 'Total number of text responses' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;

  @ApiProperty({ description: 'Has more pages' })
  hasMore: boolean;
}
