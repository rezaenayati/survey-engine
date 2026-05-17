import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Response } from './entities/response.entity';
import { SurveyVersion } from '../surveys/entities/survey-version.entity';
import { SurveysService } from '../surveys/surveys.service';
import { ResponseStatus } from '../common/constants/status.constants';
import { RequestContext } from '../common/interfaces/request-context.interface';
import { WebhookService } from '../webhooks/webhook.service';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import {
    StartResponseDto,
    UpdateResponseDto,
    ListResponsesQueryDto,
} from './dto';
import {
    ResponseValidatorService,
    LogicEngineService,
    SurveySchema,
    LogicSchema,
} from '../schema';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class ResponsesService {
    private readonly strictAuth: boolean;

    constructor(
        @InjectRepository(Response)
        private readonly responseRepository: Repository<Response>,
        @InjectRepository(SurveyVersion)
        private readonly versionRepository: Repository<SurveyVersion>,
        private readonly surveysService: SurveysService,
        private readonly responseValidator: ResponseValidatorService,
        private readonly logicEngine: LogicEngineService,
        private readonly webhookService: WebhookService,
        private readonly config: ConfigService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {
        this.strictAuth = this.config.get<string>('STRICT_AUTH') === 'true';
    }

    async start(ctx: RequestContext, dto: StartResponseDto): Promise<Response> {
        // Load survey once — used for both version resolution and webhook settings
        const survey = await this.surveysService.findOne(ctx, dto.surveyId);

        if (!survey.activeVersionId) {
            throw new BadRequestException({
                code: ErrorCodes.SURVEY_NOT_PUBLISHED,
                message: 'Survey has no published version',
            });
        }

        const version = await this.versionRepository.findOne({
            where: { id: survey.activeVersionId },
        });

        if (!version) {
            throw new NotFoundException({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'Active survey version not found',
            });
        }

        // Persist response + outbox row atomically. A crash between save and
        // webhook enqueue would otherwise leave the response committed without
        // a delivery record.
        const saved = await this.dataSource.transaction(async (manager) => {
            const draft = manager.create(Response, {
                surveyId: dto.surveyId,
                surveyVersionId: version.id,
                respondentId: ctx.userId || null,
                answersJson: dto.answersJson || {},
                metadata: dto.metadata || {},
                status: ResponseStatus.STARTED,
            });
            const persisted = await manager.save(Response, draft);

            await this.webhookService.enqueue(manager, survey.settings, {
                event: 'response.started',
                timestamp: new Date().toISOString(),
                surveyId: persisted.surveyId,
                responseId: persisted.id,
                respondentId: persisted.respondentId,
                answersJson: persisted.answersJson,
            });

            return persisted;
        });

        return saved;
    }

    async findAll(
        ctx: RequestContext,
        query: ListResponsesQueryDto,
    ): Promise<PaginatedResponseDto<Response>> {
        const {
            page = 1,
            limit = 20,
            sortBy = 'startedAt',
            sortOrder = 'DESC',
            surveyId,
            status,
        } = query;

        const where: Record<string, unknown> = {};

        if (surveyId) {
            // When filtering by survey, verify the caller owns that survey so they
            // can see all its responses (survey-owner view). The hybrid policy in
            // assertOwner covers anonymous callers and STRICT_AUTH automatically.
            const survey = await this.surveysService.findOne(ctx, surveyId);
            this.surveysService.assertOwner(survey, ctx);
            where.surveyId = surveyId;
        } else {
            // Without a surveyId, scope to the caller's own submitted responses
            where.respondentId = ctx.userId ?? '';
        }

        if (status) where.status = status;

        const [data, total] = await this.responseRepository.findAndCount({
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

    async findOne(ctx: RequestContext, id: string): Promise<Response> {
        const response = await this.responseRepository.findOne({
            where: { id },
        });

        if (!response) {
            throw new NotFoundException({
                code: ErrorCodes.RESPONSE_NOT_FOUND,
                message: `Response with ID "${id}" not found`,
            });
        }

        // Anonymous response: readable by anyone with the UUID (resume-token pattern).
        if (!response.respondentId) return response;

        // Identified response: caller must be the respondent...
        if (response.respondentId === ctx.userId) return response;

        // ...or the owner of the survey this response belongs to.
        const survey = await this.surveysService.findOne(
            ctx,
            response.surveyId,
        );
        if (survey.createdBy && survey.createdBy === ctx.userId) {
            return response;
        }

        throw new ForbiddenException({
            code: ErrorCodes.FORBIDDEN,
            message: 'You do not have access to this response',
        });
    }

    /**
     * Respondent policy (Hybrid):
     *
     * - Identified response (`respondentId` set): caller must match. Anonymous
     *   callers and other users get 403.
     * - Anonymous response (`respondentId` null): mutable by anyone by default;
     *   forbidden when `STRICT_AUTH=true`.
     */
    private assertRespondent(response: Response, ctx: RequestContext): void {
        if (response.respondentId) {
            if (!ctx.userId || response.respondentId !== ctx.userId) {
                throw new ForbiddenException({
                    code: ErrorCodes.FORBIDDEN,
                    message:
                        'Only the original respondent can modify this response',
                });
            }
            return;
        }

        if (this.strictAuth) {
            throw new ForbiddenException({
                code: ErrorCodes.STRICT_AUTH_VIOLATION,
                message:
                    'Mutating anonymous responses is disabled in strict mode',
            });
        }
    }

    async update(
        ctx: RequestContext,
        id: string,
        dto: UpdateResponseDto,
    ): Promise<Response> {
        const response = await this.findOne(ctx, id);
        this.assertRespondent(response, ctx);

        if (response.status === ResponseStatus.COMPLETED) {
            throw new BadRequestException({
                code: ErrorCodes.RESPONSE_ALREADY_COMPLETED,
                message: 'Cannot update a completed response',
            });
        }

        response.answersJson = { ...response.answersJson, ...dto.answersJson };
        if (dto.metadata) {
            response.metadata = { ...response.metadata, ...dto.metadata };
        }
        response.status = ResponseStatus.IN_PROGRESS;

        return this.responseRepository.save(response);
    }

    async complete(ctx: RequestContext, id: string): Promise<Response> {
        const response = await this.findOne(ctx, id);
        this.assertRespondent(response, ctx);

        if (response.status === ResponseStatus.COMPLETED) {
            throw new BadRequestException({
                code: ErrorCodes.RESPONSE_ALREADY_COMPLETED,
                message: 'Response is already completed',
            });
        }

        const version = await this.versionRepository.findOne({
            where: { id: response.surveyVersionId },
        });

        if (!version) {
            throw new NotFoundException({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'Survey version not found',
            });
        }

        const logicResult = this.logicEngine.evaluateLogic(
            version.schemaJson as unknown as SurveySchema,
            version.logicJson as unknown as LogicSchema | null,
            response.answersJson,
        );

        const validation = this.responseValidator.validateResponse(
            version.schemaJson,
            response.answersJson,
            { validateRequired: true, partialValidation: false },
        );

        const visibleQuestionErrors = validation.errors.filter((error) => {
            const questionId = error.path.split('.')[0];
            return logicResult.visibleQuestions.includes(questionId);
        });

        const missingLogicRequired = logicResult.requiredQuestions.filter(
            (qId) => {
                const answer = response.answersJson[qId];
                return answer === undefined || answer === null || answer === '';
            },
        );

        if (
            visibleQuestionErrors.length > 0 ||
            missingLogicRequired.length > 0
        ) {
            throw new BadRequestException({
                code: ErrorCodes.VALIDATION_FAILED,
                message: 'Response validation failed',
                errors: visibleQuestionErrors,
                missingRequired: [
                    ...validation.missingRequired,
                    ...missingLogicRequired,
                ].filter((qId) => logicResult.visibleQuestions.includes(qId)),
            });
        }

        response.status = ResponseStatus.COMPLETED;
        response.completedAt = new Date();

        // Load survey settings *before* the transaction so the enqueue inside
        // has everything it needs without spawning another query inside the tx.
        const survey = await this.surveysService.findOne(
            ctx,
            response.surveyId,
        );

        // Commit completion + outbox row together.
        const completed = await this.dataSource.transaction(async (manager) => {
            const persisted = await manager.save(Response, response);

            await this.webhookService.enqueue(manager, survey.settings, {
                event: 'response.completed',
                timestamp: new Date().toISOString(),
                surveyId: persisted.surveyId,
                responseId: persisted.id,
                respondentId: persisted.respondentId,
                answersJson: persisted.answersJson,
            });

            return persisted;
        });

        return completed;
    }

    async remove(ctx: RequestContext, id: string): Promise<void> {
        const response = await this.findOne(ctx, id);
        this.assertRespondent(response, ctx);
        await this.responseRepository.remove(response);
    }

    async validate(
        ctx: RequestContext,
        id: string,
    ): Promise<{
        valid: boolean;
        errors: unknown[];
        missingRequired: string[];
        visibleQuestions: string[];
        hiddenQuestions: string[];
        requiredQuestions: string[];
    }> {
        const response = await this.findOne(ctx, id);

        const version = await this.versionRepository.findOne({
            where: { id: response.surveyVersionId },
        });

        if (!version) {
            throw new NotFoundException({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'Survey version not found',
            });
        }

        const logicResult = this.logicEngine.evaluateLogic(
            version.schemaJson as unknown as SurveySchema,
            version.logicJson as unknown as LogicSchema | null,
            response.answersJson,
        );

        const validation = this.responseValidator.validateResponse(
            version.schemaJson,
            response.answersJson,
            { validateRequired: true, partialValidation: true },
        );

        const visibleQuestionErrors = validation.errors.filter((error) => {
            const questionId = error.path.split('.')[0];
            return logicResult.visibleQuestions.includes(questionId);
        });

        const allRequired = [
            ...new Set([
                ...validation.missingRequired,
                ...logicResult.requiredQuestions,
            ]),
        ].filter((qId) => logicResult.visibleQuestions.includes(qId));

        const missingRequired = allRequired.filter((qId) => {
            const answer = response.answersJson[qId];
            return answer === undefined || answer === null || answer === '';
        });

        return {
            valid:
                visibleQuestionErrors.length === 0 &&
                missingRequired.length === 0,
            errors: visibleQuestionErrors,
            missingRequired,
            visibleQuestions: logicResult.visibleQuestions,
            hiddenQuestions: logicResult.hiddenQuestions,
            requiredQuestions: allRequired,
        };
    }

    async evaluateLogic(
        ctx: RequestContext,
        id: string,
    ): Promise<{
        visibleQuestions: string[];
        hiddenQuestions: string[];
        visiblePages: string[];
        hiddenPages: string[];
        requiredQuestions: string[];
        calculatedValues: Record<string, unknown>;
    }> {
        const response = await this.findOne(ctx, id);

        const version = await this.versionRepository.findOne({
            where: { id: response.surveyVersionId },
        });

        if (!version) {
            throw new NotFoundException({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'Survey version not found',
            });
        }

        const result = this.logicEngine.evaluateLogic(
            version.schemaJson as unknown as SurveySchema,
            version.logicJson as unknown as LogicSchema | null,
            response.answersJson,
        );

        return {
            visibleQuestions: result.visibleQuestions,
            hiddenQuestions: result.hiddenQuestions,
            visiblePages: result.visiblePages,
            hiddenPages: result.hiddenPages,
            requiredQuestions: result.requiredQuestions,
            calculatedValues: result.calculatedValues,
        };
    }
}
