import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Survey } from './entities/survey.entity';
import { SurveyVersion } from './entities/survey-version.entity';
import { SurveysService } from './surveys.service';
import { SurveyStatus } from '../common/constants/status.constants';
import { RequestContext } from '../common/interfaces/request-context.interface';
import {
    SchemaValidatorService,
    LogicEngineService,
    SurveySchema,
    LogicSchema,
} from '../schema';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class SurveyVersionsService {
    constructor(
        @InjectRepository(Survey)
        private readonly surveyRepository: Repository<Survey>,
        @InjectRepository(SurveyVersion)
        private readonly versionRepository: Repository<SurveyVersion>,
        private readonly surveysService: SurveysService,
        private readonly schemaValidator: SchemaValidatorService,
        private readonly logicEngine: LogicEngineService,
    ) {}

    async publish(ctx: RequestContext, id: string): Promise<Survey> {
        const survey = await this.surveysService.findOne(ctx, id);
        this.surveysService.assertOwner(survey, ctx);

        if (survey.status === SurveyStatus.ARCHIVED) {
            throw new BadRequestException({
                code: ErrorCodes.SURVEY_ARCHIVED,
                message: 'Cannot publish an archived survey',
            });
        }

        if (!survey.draftSchemaJson) {
            throw new BadRequestException({
                code: ErrorCodes.INVALID_SCHEMA,
                message: 'Cannot publish survey without a schema',
            });
        }

        const schemaValidation = this.schemaValidator.validateSchema(
            survey.draftSchemaJson,
        );
        if (!schemaValidation.valid) {
            throw new BadRequestException({
                code: ErrorCodes.INVALID_SCHEMA,
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
                    code: ErrorCodes.INVALID_LOGIC,
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
            schemaJson: JSON.parse(
                JSON.stringify(survey.draftSchemaJson),
            ) as Record<string, unknown>,
            logicJson: survey.draftLogicJson
                ? (JSON.parse(JSON.stringify(survey.draftLogicJson)) as Record<
                      string,
                      unknown
                  >)
                : null,
            publishedBy: ctx.userId || null,
            checksum,
        });

        const savedVersion = await this.versionRepository.save(version);

        await this.surveyRepository.update(id, {
            status: SurveyStatus.PUBLISHED,
            activeVersionId: savedVersion.id,
        });

        return this.surveysService.findOne(ctx, id);
    }

    async getVersions(
        ctx: RequestContext,
        surveyId: string,
    ): Promise<SurveyVersion[]> {
        const survey = await this.surveysService.findOne(ctx, surveyId);
        this.surveysService.assertOwner(survey, ctx);

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
        const survey = await this.surveysService.findOne(ctx, surveyId);
        this.surveysService.assertOwner(survey, ctx);

        const version = await this.versionRepository.findOne({
            where: { id: versionId, surveyId },
        });

        if (!version)
            throw new NotFoundException({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: `Version "${versionId}" not found`,
            });

        return version;
    }

    async getRuntime(
        _ctx: RequestContext,
        surveyId: string,
    ): Promise<SurveyVersion> {
        const survey = await this.surveyRepository.findOne({
            where: { id: surveyId },
        });

        if (!survey)
            throw new NotFoundException({
                code: ErrorCodes.SURVEY_NOT_FOUND,
                message: `Survey with ID "${surveyId}" not found`,
            });
        if (!survey.activeVersionId)
            throw new BadRequestException({
                code: ErrorCodes.SURVEY_NOT_PUBLISHED,
                message: 'Survey has no published version',
            });

        const version = await this.versionRepository.findOne({
            where: { id: survey.activeVersionId },
        });

        if (!version)
            throw new NotFoundException({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'Active version not found',
            });

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
        const survey = await this.surveysService.findOne(ctx, id);
        this.surveysService.assertOwner(survey, ctx);

        let schemaValid = false;
        let logicValid = true;
        let schemaErrors: unknown[] = [];
        let schemaWarnings: unknown[] = [];
        let logicErrors: string[] = [];

        if (survey.draftSchemaJson) {
            const schemaValidation = this.schemaValidator.validateSchema(
                survey.draftSchemaJson,
            );
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

        return {
            schemaValid,
            logicValid,
            schemaErrors,
            schemaWarnings,
            logicErrors,
        };
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
        return createHash('sha256')
            .update(JSON.stringify(schema))
            .digest('hex');
    }
}
