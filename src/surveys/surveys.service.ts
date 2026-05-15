import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Survey } from './entities/survey.entity';
import { SurveyVersion } from './entities/survey-version.entity';
import { CreateSurveyDto, UpdateSurveyDto } from './dto';
import { SurveyStatus } from '../common/constants/status.constants';
import { RequestContext } from '../common/interfaces/request-context.interface';
import {
  PaginationQueryDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';
import {
  SchemaValidatorService,
  LogicEngineService,
  SurveySchema,
  LogicSchema,
} from '../validation';

@Injectable()
export class SurveysService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyVersion)
    private readonly versionRepository: Repository<SurveyVersion>,
    private readonly schemaValidator: SchemaValidatorService,
    private readonly logicEngine: LogicEngineService,
  ) {}

  async create(ctx: RequestContext, dto: CreateSurveyDto): Promise<Survey> {
    if (dto.schemaJson) {
      const schemaValidation = this.schemaValidator.validateSchema(dto.schemaJson);
      if (!schemaValidation.valid) {
        throw new BadRequestException({
          message: 'Invalid survey schema',
          errors: schemaValidation.errors,
        });
      }
    }

    if (dto.logicJson && dto.schemaJson) {
      const logicValidation = this.logicEngine.validateLogicSchema(
        dto.logicJson,
        dto.schemaJson as unknown as SurveySchema,
      );
      if (!logicValidation.valid) {
        throw new BadRequestException({
          message: 'Invalid logic rules',
          errors: logicValidation.errors,
        });
      }
    }

    const survey = this.surveyRepository.create({
      createdBy: ctx.userId || null,
      name: dto.name,
      description: dto.description,
      draftSchemaJson: dto.schemaJson || null,
      draftLogicJson: dto.logicJson || null,
      settings: {
        allowAnonymous: true,
        requireAuth: false,
        accessTokenRequired: false,
        ...dto.settings,
      },
      status: SurveyStatus.DRAFT,
    });

    return this.surveyRepository.save(survey);
  }

  /**
   * Throw 403 when a resource belongs to a specific user and the caller is a
   * different user. Anonymous callers (no userId) and ownerless resources
   * (no createdBy) are deliberately allowed so the service keeps working in
   * deployments without an auth gateway.
   */
  private assertOwner(survey: Survey, ctx: RequestContext): void {
    if (survey.createdBy && ctx.userId && survey.createdBy !== ctx.userId) {
      throw new ForbiddenException('You do not have access to this survey');
    }
  }

  async findAll(
    ctx: RequestContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<Survey>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    // Scope to the caller's own surveys; anonymous callers see nothing
    const where = ctx.userId ? { createdBy: ctx.userId } : { createdBy: '' };

    const [data, total] = await this.surveyRepository.findAndCount({
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(_ctx: RequestContext, id: string): Promise<Survey> {
    const survey = await this.surveyRepository.findOne({
      where: { id },
      relations: ['activeVersion'],
    });

    if (!survey) {
      throw new NotFoundException(`Survey with ID "${id}" not found`);
    }

    return survey;
  }

  async update(
    ctx: RequestContext,
    id: string,
    dto: UpdateSurveyDto,
  ): Promise<Survey> {
    const survey = await this.findOne(ctx, id);
    this.assertOwner(survey, ctx);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update an archived survey');
    }

    if (dto.schemaJson !== undefined) {
      const schemaValidation = this.schemaValidator.validateSchema(dto.schemaJson);
      if (!schemaValidation.valid) {
        throw new BadRequestException({
          message: 'Invalid survey schema',
          errors: schemaValidation.errors,
        });
      }
    }

    const effectiveSchema = dto.schemaJson ?? survey.draftSchemaJson;
    const effectiveLogic = dto.logicJson ?? survey.draftLogicJson;

    if (effectiveLogic && effectiveSchema && (dto.logicJson !== undefined || dto.schemaJson !== undefined)) {
      const logicValidation = this.logicEngine.validateLogicSchema(
        effectiveLogic,
        effectiveSchema as unknown as SurveySchema,
      );
      if (!logicValidation.valid) {
        throw new BadRequestException({
          message: 'Invalid logic rules',
          errors: logicValidation.errors,
        });
      }
    }

    if (dto.name !== undefined) survey.name = dto.name;
    if (dto.description !== undefined) survey.description = dto.description;
    if (dto.schemaJson !== undefined) survey.draftSchemaJson = dto.schemaJson;
    if (dto.logicJson !== undefined) survey.draftLogicJson = dto.logicJson;
    if (dto.settings !== undefined) {
      survey.settings = { ...survey.settings, ...dto.settings };
    }
    if (dto.status !== undefined) {
      survey.status = dto.status;
    }

    return this.surveyRepository.save(survey);
  }

  async remove(ctx: RequestContext, id: string): Promise<void> {
    const survey = await this.findOne(ctx, id);
    this.assertOwner(survey, ctx);
    await this.surveyRepository.remove(survey);
  }

  async publish(ctx: RequestContext, id: string): Promise<Survey> {
    const survey = await this.findOne(ctx, id);
    this.assertOwner(survey, ctx);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new BadRequestException('Cannot publish an archived survey');
    }

    if (!survey.draftSchemaJson) {
      throw new BadRequestException('Cannot publish survey without a schema');
    }

    const schemaValidation = this.schemaValidator.validateSchema(survey.draftSchemaJson);
    if (!schemaValidation.valid) {
      throw new BadRequestException({
        message: 'Cannot publish: Invalid survey schema',
        errors: schemaValidation.errors,
      });
    }

    if (survey.draftLogicJson) {
      const logicValidation = this.logicEngine.validateLogicSchema(
        survey.draftLogicJson,
        survey.draftSchemaJson as unknown as SurveySchema,
      );
      if (!logicValidation.valid) {
        throw new BadRequestException({
          message: 'Cannot publish: Invalid logic rules',
          errors: logicValidation.errors,
        });
      }
    }

    const latestVersion = await this.versionRepository.findOne({
      where: { surveyId: id },
      order: { versionNumber: 'DESC' },
    });

    const newVersionNumber = (latestVersion?.versionNumber || 0) + 1;
    const checksum = this.generateChecksum(survey.draftSchemaJson);

    const version = this.versionRepository.create({
      surveyId: id,
      versionNumber: newVersionNumber,
      schemaJson: JSON.parse(JSON.stringify(survey.draftSchemaJson)),
      logicJson: survey.draftLogicJson ? JSON.parse(JSON.stringify(survey.draftLogicJson)) : null,
      publishedBy: ctx.userId || null,
      checksum,
    });

    const savedVersion = await this.versionRepository.save(version);

    await this.surveyRepository.update(id, {
      status: SurveyStatus.PUBLISHED,
      activeVersionId: savedVersion.id,
    });

    return this.findOne(ctx, id);
  }

  async getVersions(
    ctx: RequestContext,
    surveyId: string,
  ): Promise<SurveyVersion[]> {
    const survey = await this.findOne(ctx, surveyId);
    this.assertOwner(survey, ctx);

    return this.versionRepository.find({
      where: { surveyId },
      order: { versionNumber: 'DESC' },
    });
  }

  async getVersion(
    ctx: RequestContext,
    surveyId: string,
    versionId: string,
  ): Promise<SurveyVersion> {
    const survey = await this.findOne(ctx, surveyId);
    this.assertOwner(survey, ctx);

    const version = await this.versionRepository.findOne({
      where: { id: versionId, surveyId },
    });

    if (!version) {
      throw new NotFoundException(`Version "${versionId}" not found`);
    }

    return version;
  }

  async getRuntime(
    _ctx: RequestContext,
    surveyId: string,
  ): Promise<SurveyVersion> {
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new NotFoundException(`Survey with ID "${surveyId}" not found`);
    }

    if (!survey.activeVersionId) {
      throw new BadRequestException('Survey has no published version');
    }

    const version = await this.versionRepository.findOne({
      where: { id: survey.activeVersionId },
    });

    if (!version) {
      throw new NotFoundException('Active version not found');
    }

    return version;
  }

  async validateSurvey(
    ctx: RequestContext,
    id: string,
  ): Promise<{
    schemaValid: boolean;
    logicValid: boolean;
    schemaErrors: unknown[];
    schemaWarnings: unknown[];
    logicErrors: string[];
  }> {
    const survey = await this.findOne(ctx, id);
    this.assertOwner(survey, ctx);

    let schemaValid = false;
    let logicValid = true;
    let schemaErrors: unknown[] = [];
    let schemaWarnings: unknown[] = [];
    let logicErrors: string[] = [];

    if (survey.draftSchemaJson) {
      const schemaValidation = this.schemaValidator.validateSchema(survey.draftSchemaJson);
      schemaValid = schemaValidation.valid;
      schemaErrors = schemaValidation.errors;
      schemaWarnings = schemaValidation.warnings;

      if (schemaValid && survey.draftLogicJson) {
        const logicValidation = this.logicEngine.validateLogicSchema(
          survey.draftLogicJson,
          survey.draftSchemaJson as unknown as SurveySchema,
        );
        logicValid = logicValidation.valid;
        logicErrors = logicValidation.errors;
      }
    }

    return { schemaValid, logicValid, schemaErrors, schemaWarnings, logicErrors };
  }

  async evaluateLogic(
    ctx: RequestContext,
    surveyId: string,
    answers: Record<string, unknown>,
  ): Promise<{
    visibleQuestions: string[];
    hiddenQuestions: string[];
    visiblePages: string[];
    hiddenPages: string[];
    requiredQuestions: string[];
    calculatedValues: Record<string, unknown>;
    validationErrors: Record<string, string>;
  }> {
    const version = await this.getRuntime(ctx, surveyId);

    const result = this.logicEngine.evaluateLogic(
      version.schemaJson as unknown as SurveySchema,
      version.logicJson as unknown as LogicSchema | null,
      answers,
    );

    return {
      visibleQuestions: result.visibleQuestions,
      hiddenQuestions: result.hiddenQuestions,
      visiblePages: result.visiblePages,
      hiddenPages: result.hiddenPages,
      requiredQuestions: result.requiredQuestions,
      calculatedValues: result.calculatedValues,
      validationErrors: result.validationErrors,
    };
  }

  private generateChecksum(schema: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
  }
}
