import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly strictAuth: boolean;

    constructor(
        @InjectRepository(Survey)
        private readonly surveyRepository: Repository<Survey>,
        private readonly schemaValidator: SchemaValidatorService,
        private readonly logicEngine: LogicEngineService,
        private readonly config: ConfigService,
    ) {
        this.strictAuth = this.config.get<string>('STRICT_AUTH') === 'true';
    }

    /**
     * Ownership policy (Hybrid):
     *
     * - Identified resource (`createdBy` set): caller must match. Anonymous
     *   callers and other users get 403.
     * - Anonymous resource (`createdBy` null): mutable by anyone by default;
     *   forbidden when `STRICT_AUTH=true` so deployers can opt out of allowing
     *   bystander mutations.
     */
    assertOwner(survey: Survey, ctx: RequestContext): void {
        if (survey.createdBy) {
            if (!ctx.userId || survey.createdBy !== ctx.userId) {
                throw new ForbiddenException(
                    'You do not have access to this survey',
                );
            }
            return;
        }

        if (this.strictAuth) {
            throw new ForbiddenException(
                'Mutating anonymous surveys is disabled in strict mode',
            );
        }
    }

    /**
     * Caller-visible survey lookup. Drafts and archived surveys are visible
     * only to their owner (or to anyone when the survey is anonymous); a
     * non-owner asking for someone else's draft gets 404 — same response as
     * for a non-existent ID, so the endpoint can't be used to enumerate
     * draft surveys by UUID.
     */
    async findOneVisible(ctx: RequestContext, id: string): Promise<Survey> {
        const survey = await this.findOne(ctx, id);
        if (this.canSee(survey, ctx)) return survey;
        throw new NotFoundException(`Survey with ID "${id}" not found`);
    }

    private canSee(survey: Survey, ctx: RequestContext): boolean {
        if (!survey.createdBy) return true; // anonymous resource: open
        if (survey.createdBy === ctx.userId) return true; // owner
        return survey.status === SurveyStatus.PUBLISHED;
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

    async duplicate(ctx: RequestContext, id: string): Promise<Survey> {
        const original = await this.findOne(ctx, id);
        this.assertOwner(original, ctx);

        const copy = this.surveyRepository.create({
            createdBy: ctx.userId || null,
            name: `${original.name} (copy)`,
            description: original.description,
            draftSchemaJson: original.draftSchemaJson
                ? (JSON.parse(
                      JSON.stringify(original.draftSchemaJson),
                  ) as Record<string, unknown>)
                : null,
            draftLogicJson: original.draftLogicJson
                ? (JSON.parse(
                      JSON.stringify(original.draftLogicJson),
                  ) as Record<string, unknown>)
                : null,
            settings: { ...original.settings },
            status: SurveyStatus.DRAFT,
        });

        return this.surveyRepository.save(copy);
    }

    async remove(ctx: RequestContext, id: string): Promise<void> {
        const survey = await this.findOne(ctx, id);
        this.assertOwner(survey, ctx);
        await this.surveyRepository.remove(survey);
    }
}
