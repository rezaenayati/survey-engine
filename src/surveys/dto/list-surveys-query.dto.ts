import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const SURVEY_SORTABLE_FIELDS = [
    'createdAt',
    'updatedAt',
    'name',
    'status',
] as const;
export type SurveySortField = (typeof SURVEY_SORTABLE_FIELDS)[number];

export class ListSurveysQueryDto extends PaginationQueryDto {
    @ApiPropertyOptional({
        description: 'Field to sort by',
        enum: SURVEY_SORTABLE_FIELDS,
        default: 'createdAt',
    })
    @IsOptional()
    @IsIn(SURVEY_SORTABLE_FIELDS)
    sortBy?: SurveySortField = 'createdAt';
}
