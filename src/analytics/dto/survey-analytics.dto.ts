import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import {
    VersionMode,
    AnswerFilterDto,
    AnalyticsQueryDto,
} from './analytics-query.dto';
import {
    AnalyticsSummaryDto,
    AnalyticsFunnelDto,
    AnalyticsTrendsDto,
} from './analytics-result.dto';
import { QuestionAnalyticsDto } from './question-analytics.dto';

export class AppliedFiltersDto {
    @ApiPropertyOptional({ description: 'Date range filter' })
    dateRange?: { startDate?: string; endDate?: string };

    @ApiPropertyOptional({ description: 'Version mode used' })
    versionMode?: VersionMode;

    @ApiPropertyOptional({ description: 'Specific version ID if applicable' })
    versionId?: string;

    @ApiPropertyOptional({ description: 'Number of respondent IDs filtered' })
    respondentIdsCount?: number;

    @ApiPropertyOptional({
        description: 'Answer filters applied',
        type: [AnswerFilterDto],
    })
    answerFilters?: AnswerFilterDto[];

    @ApiPropertyOptional({ description: 'Response status filter' })
    status?: string;
}

export class SurveyAnalyticsDto {
    @ApiProperty({ description: 'Survey ID' })
    surveyId: string;

    @ApiProperty({ description: 'Survey name' })
    surveyName: string;

    @ApiProperty({
        description: 'Summary statistics',
        type: AnalyticsSummaryDto,
    })
    summary: AnalyticsSummaryDto;

    @ApiProperty({ description: 'Completion funnel', type: AnalyticsFunnelDto })
    funnel: AnalyticsFunnelDto;

    @ApiProperty({ description: 'Response trends', type: AnalyticsTrendsDto })
    trends: AnalyticsTrendsDto;

    @ApiProperty({
        description: 'Per-question analytics',
        type: [QuestionAnalyticsDto],
    })
    questions: QuestionAnalyticsDto[];

    @ApiProperty({ description: 'Analytics generation timestamp' })
    generatedAt: string;

    @ApiPropertyOptional({
        description: 'Filters applied to this report',
        type: AppliedFiltersDto,
    })
    appliedFilters?: AppliedFiltersDto;
}

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
