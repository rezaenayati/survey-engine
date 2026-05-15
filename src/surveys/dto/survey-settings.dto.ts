import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsArray,
  IsIn,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { WebhookEvent } from '../entities/survey.entity';

const WEBHOOK_EVENTS: WebhookEvent[] = [
  'response.started',
  'response.completed',
];

export class SurveySettingsDto {
  @ApiPropertyOptional({
    description: 'Allow anonymous (unauthenticated) responses',
  })
  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @ApiPropertyOptional({
    description: 'Require the caller to supply X-User-ID',
  })
  @IsOptional()
  @IsBoolean()
  requireAuth?: boolean;

  @ApiPropertyOptional({ description: 'Require a per-response access token' })
  @IsOptional()
  @IsBoolean()
  accessTokenRequired?: boolean;

  @ApiPropertyOptional({
    description: 'ISO-8601 date from which the survey accepts responses',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'ISO-8601 date after which the survey stops accepting responses',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Maximum number of responses to accept' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxResponses?: number;

  @ApiPropertyOptional({
    description: 'HTTPS URL to POST webhook events to',
    example: 'https://your-service.example.com/webhooks/survey',
  })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  webhookUrl?: string;

  @ApiPropertyOptional({
    description: 'HMAC-SHA256 secret for signing webhook payloads',
  })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({
    description: 'Which events to deliver. Defaults to all events.',
    enum: WEBHOOK_EVENTS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  webhookEvents?: WebhookEvent[];
}
