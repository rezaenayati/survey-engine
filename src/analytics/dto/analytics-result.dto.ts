import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsSummaryDto {
  @ApiProperty({ description: 'Total number of responses' })
  totalResponses: number;

  @ApiProperty({ description: 'Number of completed responses' })
  completedResponses: number;

  @ApiProperty({ description: 'Completion rate (0–100)' })
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

  @ApiPropertyOptional({ description: 'Version numbers included in this analysis', type: [Number] })
  versionsIncluded?: number[];
}

export class AnalyticsFunnelDto {
  @ApiProperty({ description: 'Total responses (all statuses)' })
  total: number;

  @ApiProperty({ description: 'Just-started responses (no answers yet)' })
  started: number;

  @ApiProperty({ description: 'In-progress responses (partial answers)' })
  inProgress: number;

  @ApiProperty({ description: 'Completed responses (fully submitted)' })
  completed: number;

  @ApiProperty({ description: 'Explicitly abandoned responses' })
  abandoned: number;

  @ApiProperty({ description: 'Active responses not yet finished (started + inProgress)' })
  activeResponses: number;

  @ApiProperty({ description: 'Stale responses (in_progress with no activity for X days)' })
  staleResponses: number;

  @ApiProperty({ description: 'Completion rate (completed / total × 100)' })
  completionRate: number;

  @ApiProperty({ description: 'Drop-off rate ((total - completed) / total × 100)' })
  dropOffRate: number;

  @ApiProperty({ description: 'Abandonment rate (abandoned / total × 100)' })
  abandonmentRate: number;
}

export class TrendDataPointDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Number of responses' })
  count: number;

  @ApiProperty({ description: 'Number of completed responses' })
  completed: number;
}

export class AnalyticsTrendsDto {
  @ApiProperty({ description: 'Daily response counts', type: [TrendDataPointDto] })
  daily: TrendDataPointDto[];

  @ApiProperty({ description: 'Weekly response counts', type: [TrendDataPointDto] })
  weekly: TrendDataPointDto[];
}
