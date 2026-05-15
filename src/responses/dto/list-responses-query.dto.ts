import { IsOptional, IsIn, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ResponseStatus } from '../../common/constants/status.constants';

export const RESPONSE_SORTABLE_FIELDS = [
  'startedAt',
  'updatedAt',
  'completedAt',
] as const;
export type ResponseSortField = (typeof RESPONSE_SORTABLE_FIELDS)[number];

export class ListResponsesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: RESPONSE_SORTABLE_FIELDS,
    default: 'startedAt',
  })
  @IsOptional()
  @IsIn(RESPONSE_SORTABLE_FIELDS)
  sortBy?: ResponseSortField = 'startedAt';

  @ApiPropertyOptional({ description: 'Filter by survey ID' })
  @IsOptional()
  @IsUUID()
  surveyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ResponseStatus,
  })
  @IsOptional()
  @IsEnum(ResponseStatus)
  status?: ResponseStatus;
}
