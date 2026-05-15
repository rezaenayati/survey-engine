import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SurveyStatus } from '../../common/constants/status.constants';
import type { SurveySettings } from '../entities/survey.entity';

export class SurveyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: SurveyStatus })
  status: SurveyStatus;

  @ApiPropertyOptional()
  activeVersionId: string | null;

  @ApiPropertyOptional()
  draftSchemaJson: Record<string, unknown> | null;

  @ApiPropertyOptional()
  draftLogicJson: Record<string, unknown> | null;

  @ApiProperty()
  settings: SurveySettings;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SurveyVersionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  surveyId: string;

  @ApiProperty()
  versionNumber: number;

  @ApiProperty()
  schemaJson: Record<string, unknown>;

  @ApiPropertyOptional()
  logicJson: Record<string, unknown> | null;

  @ApiProperty()
  publishedBy: string;

  @ApiProperty()
  checksum: string;

  @ApiProperty()
  isDeprecated: boolean;

  @ApiProperty()
  createdAt: Date;
}
