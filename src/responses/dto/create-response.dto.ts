import { IsUUID, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartResponseDto {
  @ApiProperty({ description: 'Survey ID' })
  @IsUUID()
  surveyId: string;

  @ApiPropertyOptional({ description: 'Initial answers (JSON)' })
  @IsOptional()
  @IsObject()
  answersJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Response metadata (browser, etc.)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateResponseDto {
  @ApiProperty({ description: 'Answers (JSON)' })
  @IsObject()
  answersJson: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Response metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
