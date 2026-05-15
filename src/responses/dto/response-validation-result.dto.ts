import { ApiProperty } from '@nestjs/swagger';

export class ResponseValidationResultDto {
  @ApiProperty({ description: 'Whether the current answers pass all validation rules' })
  valid: boolean;

  @ApiProperty({ description: 'Validation errors', type: [Object] })
  errors: unknown[];

  @ApiProperty({ description: 'IDs of required questions that are unanswered', type: [String] })
  missingRequired: string[];

  @ApiProperty({ description: 'IDs of currently visible questions', type: [String] })
  visibleQuestions: string[];

  @ApiProperty({ description: 'IDs of currently hidden questions', type: [String] })
  hiddenQuestions: string[];

  @ApiProperty({ description: 'IDs of questions that are required', type: [String] })
  requiredQuestions: string[];
}
