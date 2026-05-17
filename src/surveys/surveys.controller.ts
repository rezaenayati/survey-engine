import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    ParseUUIDPipe,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiSecurity,
} from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import { CreateSurveyDto, UpdateSurveyDto, ListSurveysQueryDto } from './dto';
import { SurveyDto } from './dto/survey.dto';
import { GetContext } from '../common/decorators/request-context.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';

@ApiTags('surveys')
@ApiSecurity('user-id')
@Controller('surveys')
export class SurveysController {
    constructor(private readonly surveysService: SurveysService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new survey' })
    @ApiResponse({
        status: 201,
        description: 'Survey created',
        type: SurveyDto,
    })
    async create(
        @GetContext() ctx: RequestContext,
        @Body() dto: CreateSurveyDto,
    ): Promise<SurveyDto> {
        return this.surveysService.create(ctx, dto);
    }

    @Get()
    @ApiOperation({ summary: 'List surveys owned by the caller' })
    @ApiResponse({ status: 200, description: 'List of surveys' })
    async findAll(
        @GetContext() ctx: RequestContext,
        @Query() query: ListSurveysQueryDto,
    ): Promise<PaginatedResponseDto<SurveyDto>> {
        return this.surveysService.findAll(ctx, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a survey by ID' })
    @ApiParam({ name: 'id', description: 'Survey ID' })
    @ApiResponse({ status: 200, description: 'Survey found', type: SurveyDto })
    @ApiResponse({
        status: 404,
        description:
            'Survey not found, or the caller is not allowed to see this survey ' +
            'in its current status (drafts/archived are visible only to their owner).',
    })
    async findOne(
        @GetContext() ctx: RequestContext,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<SurveyDto> {
        return this.surveysService.findOneVisible(ctx, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a survey' })
    @ApiParam({ name: 'id', description: 'Survey ID' })
    @ApiResponse({
        status: 200,
        description: 'Survey updated',
        type: SurveyDto,
    })
    @ApiResponse({ status: 404, description: 'Survey not found' })
    async update(
        @GetContext() ctx: RequestContext,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateSurveyDto,
    ): Promise<SurveyDto> {
        return this.surveysService.update(ctx, id, dto);
    }

    @Post(':id/duplicate')
    @ApiOperation({
        summary: 'Duplicate a survey',
        description:
            'Creates a new draft copy of the survey. The copy has the same schema, logic, and settings but a fresh ID and "(copy)" appended to the name.',
    })
    @ApiParam({ name: 'id', description: 'Survey ID to duplicate' })
    @ApiResponse({
        status: 201,
        description: 'Duplicated survey (new draft)',
        type: SurveyDto,
    })
    @ApiResponse({ status: 404, description: 'Survey not found' })
    async duplicate(
        @GetContext() ctx: RequestContext,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<SurveyDto> {
        return this.surveysService.duplicate(ctx, id);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a survey' })
    @ApiParam({ name: 'id', description: 'Survey ID' })
    @ApiResponse({ status: 204, description: 'Survey deleted' })
    @ApiResponse({ status: 404, description: 'Survey not found' })
    async remove(
        @GetContext() ctx: RequestContext,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        return this.surveysService.remove(ctx, id);
    }
}
