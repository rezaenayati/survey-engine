import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResponsesService } from '../../../src/responses/responses.service';
import { Response } from '../../../src/responses/entities/response.entity';
import { SurveyVersion } from '../../../src/surveys/entities/survey-version.entity';
import { SurveysService } from '../../../src/surveys/surveys.service';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';
import { LogicEngineService } from '../../../src/schema/services/logic-engine.service';
import { ResponseValidatorService } from '../../../src/schema/services/response-validator.service';
import { WebhookService } from '../../../src/webhooks/webhook.service';
import { ResponseStatus } from '../../../src/common/constants/status.constants';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const validSchema = {
    pages: [
        {
            name: 'page1',
            elements: [
                { name: 'q1', type: 'text', title: 'Q1', isRequired: false },
            ],
        },
    ],
};

const activeVersion: Partial<SurveyVersion> = {
    id: 'version-1',
    schemaJson: validSchema,
    logicJson: null,
};

function makeResponseRepo(overrides = {}) {
    return {
        create: jest.fn((data) => data),
        save: jest.fn(async (e) => ({ id: 'resp-1', ...e })),
        findOne: jest.fn(),
        findAndCount: jest.fn(),
        remove: jest.fn(async () => undefined),
        ...overrides,
    };
}

describe('ResponsesService', () => {
    let service: ResponsesService;
    let responseRepo: ReturnType<typeof makeResponseRepo>;
    let versionRepo: { findOne: jest.Mock };
    let surveysService: { getRuntime: jest.Mock; findOne: jest.Mock };

    beforeEach(async () => {
        responseRepo = makeResponseRepo();
        versionRepo = { findOne: jest.fn().mockResolvedValue(activeVersion) };
        surveysService = {
            getRuntime: jest.fn().mockResolvedValue(activeVersion),
            findOne: jest.fn().mockResolvedValue({
                id: 's1',
                settings: {},
                activeVersionId: 'version-1',
            }),
        };

        const module = await Test.createTestingModule({
            providers: [
                ResponsesService,
                SchemaValidatorService,
                LogicEngineService,
                ResponseValidatorService,
                {
                    provide: getRepositoryToken(Response),
                    useValue: responseRepo,
                },
                {
                    provide: getRepositoryToken(SurveyVersion),
                    useValue: versionRepo,
                },
                { provide: SurveysService, useValue: surveysService },
                { provide: WebhookService, useValue: { fire: jest.fn() } },
            ],
        }).compile();

        service = module.get(ResponsesService);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // start
    // ──────────────────────────────────────────────────────────────────────────

    describe('start', () => {
        it('creates a new response with STARTED status', async () => {
            responseRepo.save.mockResolvedValue({
                id: 'r1',
                status: ResponseStatus.STARTED,
                surveyId: 's1',
            });

            const result = await service.start(ctx, { surveyId: 's1' });
            expect(result.status).toBe(ResponseStatus.STARTED);
            expect(responseRepo.save).toHaveBeenCalled();
        });

        it('sets respondentId from ctx.userId', async () => {
            responseRepo.save.mockResolvedValue({ id: 'r1' });
            await service.start(ctx, { surveyId: 's1' });
            expect(responseRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ respondentId: 'user-1' }),
            );
        });

        it('sets respondentId to null for anonymous context', async () => {
            const anonCtx: RequestContext = { correlationId: 'corr-1' };
            responseRepo.save.mockResolvedValue({ id: 'r1' });
            await service.start(anonCtx, { surveyId: 's1' });
            expect(responseRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ respondentId: null }),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // findOne
    // ──────────────────────────────────────────────────────────────────────────

    describe('findOne', () => {
        it('returns response when found', async () => {
            const response = {
                id: 'r1',
                surveyId: 's1',
                status: ResponseStatus.STARTED,
            };
            responseRepo.findOne.mockResolvedValue(response);
            expect(await service.findOne(ctx, 'r1')).toBe(response);
        });

        it('throws NotFoundException when not found', async () => {
            responseRepo.findOne.mockResolvedValue(null);
            await expect(service.findOne(ctx, 'bad-id')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // update
    // ──────────────────────────────────────────────────────────────────────────

    describe('update', () => {
        it('merges answers into existing response', async () => {
            const existing = {
                id: 'r1',
                status: ResponseStatus.STARTED,
                answersJson: { q1: 'old' },
                metadata: {},
            };
            responseRepo.findOne.mockResolvedValue(existing);
            responseRepo.save.mockResolvedValue({
                ...existing,
                answersJson: { q1: 'new' },
                status: ResponseStatus.IN_PROGRESS,
            });

            const result = await service.update(ctx, 'r1', {
                answersJson: { q1: 'new' },
            });
            expect(result.status).toBe(ResponseStatus.IN_PROGRESS);
            expect(responseRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ answersJson: { q1: 'new' } }),
            );
        });

        it('throws BadRequestException when response is already completed', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                status: ResponseStatus.COMPLETED,
                answersJson: {},
                metadata: {},
            });
            await expect(
                service.update(ctx, 'r1', { answersJson: {} }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // complete
    // ──────────────────────────────────────────────────────────────────────────

    describe('complete', () => {
        it('completes a valid in-progress response', async () => {
            const response = {
                id: 'r1',
                status: ResponseStatus.IN_PROGRESS,
                surveyVersionId: 'version-1',
                answersJson: {},
            };
            responseRepo.findOne.mockResolvedValue(response);
            responseRepo.save.mockResolvedValue({
                ...response,
                status: ResponseStatus.COMPLETED,
                completedAt: new Date(),
            });

            const result = await service.complete(ctx, 'r1');
            expect(result.status).toBe(ResponseStatus.COMPLETED);
            expect(result.completedAt).toBeDefined();
        });

        it('throws BadRequestException when response is already completed', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                status: ResponseStatus.COMPLETED,
                surveyVersionId: 'v1',
                answersJson: {},
            });
            await expect(service.complete(ctx, 'r1')).rejects.toBeInstanceOf(
                BadRequestException,
            );
        });

        it('throws NotFoundException when survey version not found', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                status: ResponseStatus.IN_PROGRESS,
                surveyVersionId: 'missing-version',
                answersJson: {},
            });
            versionRepo.findOne.mockResolvedValue(null);
            await expect(service.complete(ctx, 'r1')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('throws ForbiddenException when a different user tries to complete', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                status: ResponseStatus.IN_PROGRESS,
                surveyVersionId: 'version-1',
                respondentId: 'other-user',
                surveyId: 's1',
                answersJson: {},
            });
            await expect(service.complete(ctx, 'r1')).rejects.toThrow(
                'Only the original respondent',
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // findAll
    // ──────────────────────────────────────────────────────────────────────────

    describe('findAll', () => {
        it('scopes to respondentId when no surveyId provided', async () => {
            responseRepo.findAndCount.mockResolvedValue([[], 0]);

            await service.findAll(ctx, {});

            expect(responseRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ respondentId: 'user-1' }),
                }),
            );
        });

        it('scopes to surveyId when provided and caller owns the survey', async () => {
            surveysService.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'user-1',
                settings: {},
                activeVersionId: null,
            });
            responseRepo.findAndCount.mockResolvedValue([[], 0]);

            await service.findAll(ctx, { surveyId: 's1' });

            expect(responseRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ surveyId: 's1' }),
                }),
            );
        });

        it('throws ForbiddenException when caller does not own the survey', async () => {
            surveysService.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'other-user',
                settings: {},
                activeVersionId: null,
            });

            await expect(
                service.findAll(ctx, { surveyId: 's1' }),
            ).rejects.toThrow('You do not have access');
        });

        it('returns paginated metadata', async () => {
            responseRepo.findAndCount.mockResolvedValue([
                [{ id: 'r1' }, { id: 'r2' }],
                45,
            ]);

            const result = await service.findAll(ctx, { page: 2, limit: 20 });

            expect(result.meta.total).toBe(45);
            expect(result.meta.page).toBe(2);
            expect(result.meta.totalPages).toBe(3);
            expect(result.data).toHaveLength(2);
        });

        it('filters by status when provided', async () => {
            responseRepo.findAndCount.mockResolvedValue([[], 0]);

            await service.findAll(ctx, { status: ResponseStatus.COMPLETED });

            expect(responseRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: ResponseStatus.COMPLETED,
                    }),
                }),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // remove
    // ──────────────────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('removes response when caller is the respondent', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'user-1',
            });

            await service.remove(ctx, 'r1');

            expect(responseRepo.remove).toHaveBeenCalled();
        });

        it('throws ForbiddenException when caller is not the respondent', async () => {
            // findOne will check: respondentId !== userId → survey ownership check → survey also owned by other-user → 403
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'other-user',
                surveyId: 's1',
            });
            surveysService.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'other-user',
                settings: {},
                activeVersionId: null,
            });

            await expect(service.remove(ctx, 'r1')).rejects.toThrow(
                'You do not have access',
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validate
    // ──────────────────────────────────────────────────────────────────────────

    describe('validate', () => {
        it('returns valid=true when all required questions are answered', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'user-1',
                surveyVersionId: 'version-1',
                answersJson: { q1: 'answer' },
            });

            const result = await service.validate(ctx, 'r1');

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('throws NotFoundException when version is missing', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'user-1',
                surveyVersionId: 'bad-version',
                answersJson: {},
            });
            versionRepo.findOne.mockResolvedValue(null);

            await expect(service.validate(ctx, 'r1')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('returns visibleQuestions and hiddenQuestions', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'user-1',
                surveyVersionId: 'version-1',
                answersJson: {},
            });

            const result = await service.validate(ctx, 'r1');

            expect(Array.isArray(result.visibleQuestions)).toBe(true);
            expect(Array.isArray(result.hiddenQuestions)).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // evaluateLogic
    // ──────────────────────────────────────────────────────────────────────────

    describe('evaluateLogic', () => {
        it('returns logic evaluation result for response answers', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'user-1',
                surveyVersionId: 'version-1',
                answersJson: { q1: 'test' },
            });

            const result = await service.evaluateLogic(ctx, 'r1');

            expect(Array.isArray(result.visibleQuestions)).toBe(true);
            expect(Array.isArray(result.visiblePages)).toBe(true);
            expect(typeof result.calculatedValues).toBe('object');
        });

        it('throws NotFoundException when version is missing', async () => {
            responseRepo.findOne.mockResolvedValue({
                id: 'r1',
                respondentId: 'user-1',
                surveyVersionId: 'bad-version',
                answersJson: {},
            });
            versionRepo.findOne.mockResolvedValue(null);

            await expect(
                service.evaluateLogic(ctx, 'r1'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // start — webhook
    // ──────────────────────────────────────────────────────────────────────────

    describe('start — webhook', () => {
        it('fires response.started webhook after saving', async () => {
            const webhookService = { fire: jest.fn() };

            // Re-create module with captured webhookService
            const { Test: TestNest } = await import('@nestjs/testing');
            const { SchemaValidatorService } =
                await import('../../../src/schema/services/schema-validator.service');
            const { LogicEngineService } =
                await import('../../../src/schema/services/logic-engine.service');
            const { ResponseValidatorService } =
                await import('../../../src/schema/services/response-validator.service');
            const { getRepositoryToken: grt } = await import('@nestjs/typeorm');

            const localRepoR = makeResponseRepo({
                save: jest
                    .fn()
                    .mockResolvedValue({
                        id: 'r2',
                        surveyId: 's1',
                        respondentId: 'user-1',
                        answersJson: {},
                    }),
            });
            const localVR = {
                findOne: jest.fn().mockResolvedValue(activeVersion),
            };
            const localSurveys = {
                findOne: jest
                    .fn()
                    .mockResolvedValue({
                        id: 's1',
                        settings: {
                            webhookUrl: 'http://x',
                            webhookEvents: ['response.started'],
                        },
                        activeVersionId: 'version-1',
                    }),
            };

            const m = await TestNest.createTestingModule({
                providers: [
                    ResponsesService,
                    SchemaValidatorService,
                    LogicEngineService,
                    ResponseValidatorService,
                    { provide: grt(Response), useValue: localRepoR },
                    { provide: grt(SurveyVersion), useValue: localVR },
                    { provide: SurveysService, useValue: localSurveys },
                    { provide: WebhookService, useValue: webhookService },
                ],
            }).compile();

            const svc = m.get(ResponsesService);
            await svc.start(ctx, { surveyId: 's1' });

            expect(webhookService.fire).toHaveBeenCalledWith(
                expect.objectContaining({ webhookUrl: 'http://x' }),
                expect.objectContaining({ event: 'response.started' }),
            );
        });
    });
});
