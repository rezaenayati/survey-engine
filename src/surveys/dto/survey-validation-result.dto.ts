import { ApiProperty } from '@nestjs/swagger';

export class SurveyValidationResultDto {
  @ApiProperty({ description: 'Whether the draft JSON schema is valid' })
  schemaValid: boolean;

  @ApiProperty({ description: 'Whether the draft logic rules are valid' })
  logicValid: boolean;

  @ApiProperty({ description: 'Schema validation errors', type: [Object] })
  schemaErrors: unknown[];

  @ApiProperty({ description: 'Schema validation warnings', type: [Object] })
  schemaWarnings: unknown[];

  @ApiProperty({ description: 'Logic validation errors', type: [String] })
  logicErrors: string[];
}
