import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateResponseDto {
    @ApiProperty({ description: 'Answers (JSON)' })
    @IsObject()
    answersJson: Record<string, unknown>;

    @ApiPropertyOptional({ description: 'Response metadata' })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;
}
