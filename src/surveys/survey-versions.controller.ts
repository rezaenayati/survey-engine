import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { SurveyVersionsService } from './survey-versions.service';
import {
  SurveyDto,
  SurveyVersionDto,
  EvaluateLogicDto,
  SurveyValidationResultDto,
  LogicEvaluationResultDto,
} from './dto';
import { GetContext } from '../common/decorators/request-context.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';

@ApiTags('surveys')
@ApiSecurity('user-id')
@Controller('surveys')
export class SurveyVersionsController {
  constructor(private readonly surveyVersionsService: SurveyVersionsService) {}

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a survey (creates a new immutable version)' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({ status: 200, description: 'Survey published', type: SurveyDto })
  @ApiResponse({ status: 400, description: 'Cannot publish survey' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async publish(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyDto> {
    return this.surveyVersionsService.publish(ctx, id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({ status: 200, description: 'List of versions', type: [SurveyVersionDto] })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getVersions(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyVersionDto[]> {
    return this.surveyVersionsService.getVersions(ctx, id);
  }

  @Get(':id/versions/:versionId')
  @ApiOperation({ summary: 'Get a specific version of a survey' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiParam({ name: 'versionId', description: 'Version ID' })
  @ApiResponse({ status: 200, description: 'Version found', type: SurveyVersionDto })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getVersion(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<SurveyVersionDto> {
    return this.surveyVersionsService.getVersion(ctx, id, versionId);
  }

  @Get(':id/runtime')
  @ApiOperation({ summary: 'Get the active published version (for respondents)' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({ status: 200, description: 'Runtime version', type: SurveyVersionDto })
  @ApiResponse({ status: 400, description: 'No published version' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getRuntime(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyVersionDto> {
    return this.surveyVersionsService.getRuntime(ctx, id);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate the draft schema and logic rules without publishing' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({ status: 200, description: 'Validation result', type: SurveyValidationResultDto })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async validateSurvey(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyValidationResultDto> {
    return this.surveyVersionsService.validateSurvey(ctx, id);
  }

  @Post(':id/evaluate-logic')
  @ApiOperation({ summary: 'Evaluate logic rules for the given answers' })
  @ApiParam({ name: 'id', description: 'Survey ID' })
  @ApiResponse({ status: 200, description: 'Logic evaluation result', type: LogicEvaluationResultDto })
  @ApiResponse({ status: 400, description: 'No published version' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async evaluateLogic(
    @GetContext() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateLogicDto,
  ): Promise<LogicEvaluationResultDto> {
    return this.surveyVersionsService.evaluateLogic(ctx, id, dto.answers);
  }
}
