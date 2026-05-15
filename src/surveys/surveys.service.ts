import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Survey } from './entities/survey.entity';
import { CreateSurveyDto, UpdateSurveyDto } from './dto';
import { SurveyStatus } from '../common/constants/status.constants';
import { RequestContext } from '../common/interfaces/request-context.interface';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import { ListSurveysQueryDto } from './dto/list-surveys-query.dto';
import {
    SchemaValidatorService,
    LogicEngineService,
    SurveySchema,
} from '../schema';

@Injectable()
export class SurveysService {
    constructor(
        @InjectRepository(Survey)
        private readonly surveyRepository: Repository<Survey>,
        private readonly schemaValidator: SchemaValidatorService,
        private readonly logicEngine: LogicEngineService,
    ) {}

    /**
     * Throw 403 when a resource belongs to a specific user and the caller is a
     * different user. Anonymous callers (no userId) and ownerless resources
     * (no createdBy) are deliberately allowed so the service keeps working in
     * deployments without an auth gateway.
     */
    assertOwner(survey: Survey, ctx: RequestContext): void {
        if (survey.createdBy && ctx.userId && survey.createdBy !== ctx.userId) {
            throw new ForbiddenException(
                'You do not have access to this survey',
            );
        }
    }

    async create(ctx: RequestContext, dto: CreateSurveyDto): Promise<Survey> {
        if (dto.schemaJson) {
            const schemaValidation = this.schemaValidator.validateSchema(
                dto.schemaJson,
            );
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

    async findAll(
        ctx: RequestContext,
        query: ListSurveysQueryDto,
    ): Promise<PaginatedResponseDto<Survey>> {
        const {
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'DESC',
        } = query;

        // Authenticated users see their own surveys (all statuses).
        // Unauthenticated/anonymous callers see only published surveys across all owners
        // — this powers the public survey-list page without requiring ownership.
        const where = ctx.userId
            ? { createdBy: ctx.userId }
            : { status: SurveyStatus.PUBLISHED };

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

        if (!survey)
            throw new NotFoundException(`Survey with ID "${id}" not found`);

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
            const schemaValidation = this.schemaValidator.validateSchema(
                dto.schemaJson,
            );
            if (!schemaValidation.valid) {
                throw new BadRequestException({
                    message: 'Invalid survey schema',
                    errors: schemaValidation.errors,
                });
            }
        }

        const effectiveSchema = dto.schemaJson ?? survey.draftSchemaJson;
        const effectiveLogic = dto.logicJson ?? survey.draftLogicJson;

        if (
            effectiveLogic &&
            effectiveSchema &&
            (dto.logicJson !== undefined || dto.schemaJson !== undefined)
        ) {
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
        if (dto.schemaJson !== undefined)
            survey.draftSchemaJson = dto.schemaJson;
        if (dto.logicJson !== undefined) survey.draftLogicJson = dto.logicJson;
        if (dto.settings !== undefined)
            survey.settings = { ...survey.settings, ...dto.settings };
        if (dto.status !== undefined) survey.status = dto.status;

        return this.surveyRepository.save(survey);
    }

    async remove(ctx: RequestContext, id: string): Promise<void> {
        const survey = await this.findOne(ctx, id);
        this.assertOwner(survey, ctx);
        await this.surveyRepository.remove(survey);
    }
}
