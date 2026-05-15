import {
  IsString,
  IsOptional,
  IsObject,
  IsEnum,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SurveyStatus } from '../../common/constants/status.constants';
import { SurveySettingsDto } from './survey-settings.dto';

export class UpdateSurveyDto {
  @ApiPropertyOptional({ description: 'Survey name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Survey description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Survey schema (JSON)' })
  @IsOptional()
  @IsObject()
  schemaJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Survey logic rules (JSON)' })
  @IsOptional()
  @IsObject()
  logicJson?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Survey settings',
    type: SurveySettingsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SurveySettingsDto)
  settings?: SurveySettingsDto;

  @ApiPropertyOptional({ enum: SurveyStatus, description: 'Survey status' })
  @IsOptional()
  @IsEnum(SurveyStatus)
  status?: SurveyStatus;
}
