import {
    IsString,
    IsOptional,
    IsObject,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SurveySettingsDto } from './survey-settings.dto';

export class CreateSurveyDto {
    @ApiProperty({
        description: 'Survey name',
        example: 'Customer Satisfaction Survey',
    })
    @IsString()
    @MaxLength(255)
    name: string;

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
}
