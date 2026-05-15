import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogicEvaluationResultDto {
    @ApiProperty({ type: [String] })
    visibleQuestions: string[];

    @ApiProperty({ type: [String] })
    hiddenQuestions: string[];

    @ApiProperty({ type: [String] })
    visiblePages: string[];

    @ApiProperty({ type: [String] })
    hiddenPages: string[];

    @ApiProperty({ type: [String] })
    requiredQuestions: string[];

    @ApiProperty({ type: 'object', additionalProperties: true })
    calculatedValues: Record<string, unknown>;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: { type: 'string' },
    })
    validationErrors?: Record<string, string>;
}
