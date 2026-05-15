import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EvaluateLogicDto {
    @ApiProperty({
        description:
            'Current answer state — a map of questionId to answer value',
    })
    @IsObject()
    answers: Record<string, unknown>;
}
