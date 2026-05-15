import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WordFrequencyDto {
  @ApiProperty({ description: 'The word' })
  word: string;

  @ApiProperty({ description: 'Number of occurrences' })
  count: number;
}

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
    description: 'True if this option was removed in newer versions',
  })
  isLegacy?: boolean;

  @ApiPropertyOptional({
    description: 'Version numbers where this option exists',
    type: [Number],
  })
  fromVersions?: number[];
}

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

  @ApiPropertyOptional({
    description: 'Standard deviation for numeric questions',
  })
  stdDeviation?: number;

  @ApiPropertyOptional({ description: 'Minimum value for numeric questions' })
  min?: number;

  @ApiPropertyOptional({ description: 'Maximum value for numeric questions' })
  max?: number;

  @ApiPropertyOptional({
    description: 'Value distribution for rating/scale questions',
  })
  valueDistribution?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Word frequency for text questions (sampled)',
    type: [WordFrequencyDto],
  })
  wordFrequency?: WordFrequencyDto[];

  @ApiPropertyOptional({
    description: 'Average text length for text questions',
  })
  avgTextLength?: number;

  @ApiPropertyOptional({
    description: 'Number of responses analyzed for word frequency',
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
