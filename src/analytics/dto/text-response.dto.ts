import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AnalyticsQueryDto } from './analytics-query.dto';

export class TextResponsesQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', default: 20 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search/filter text responses' })
  @IsOptional()
  @IsString()
  search?: string;
}

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
