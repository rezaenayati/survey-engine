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

export enum VersionMode {
  COMBINED = 'combined',
  SPECIFIC = 'specific',
}

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
 * Filter for cross-question analytics.
 * Example: show analytics only for respondents who answered "Yes" to question "q3".
 */
export class AnswerFilterDto {
  @ApiProperty({ description: 'Question ID to filter by' })
  @IsString()
  questionId: string;

  @ApiProperty({ description: 'Filter operator', enum: FilterOperator })
  @IsEnum(FilterOperator)
  operator: FilterOperator;

  @ApiProperty({
    description:
      'Value to compare against (string, number, or array for "in" operator)',
  })
  value: string | number | string[];
}

/**
 * Common query parameters shared by all analytics endpoints.
 * Extended by ExportQueryDto and TextResponsesQueryDto.
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

  @ApiPropertyOptional({
    description:
      'Filter by specific survey version (required if versionMode is "specific")',
  })
  @IsOptional()
  @IsUUID()
  versionId?: string;

  @ApiPropertyOptional({
    description: 'Filter by response status',
    enum: ResponseStatus,
  })
  @IsOptional()
  @IsEnum(ResponseStatus)
  status?: ResponseStatus;

  @ApiPropertyOptional({
    description:
      'Version handling mode: "combined" merges all versions, "specific" uses one version',
    enum: VersionMode,
    default: VersionMode.COMBINED,
  })
  @IsOptional()
  @IsEnum(VersionMode)
  versionMode?: VersionMode = VersionMode.COMBINED;

  @ApiPropertyOptional({
    description:
      'Filter by specific respondent IDs (for external segmentation)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : (value as string[]),
  )
  respondentIds?: string[];

  @ApiPropertyOptional({
    description: 'Cross-question answer filters',
    type: [AnswerFilterDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerFilterDto)
  answerFilters?: AnswerFilterDto[];

  @ApiPropertyOptional({
    description:
      'Days of inactivity to consider a response "stale" (default: 7)',
    default: 7,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  staleDays?: number = 7;
}
