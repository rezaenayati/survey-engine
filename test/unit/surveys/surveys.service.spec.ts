import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { SurveysService } from '../../../src/surveys/surveys.service';
import { Survey } from '../../../src/surveys/entities/survey.entity';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';
import { LogicEngineService } from '../../../src/schema/services/logic-engine.service';
import { SurveyStatus } from '../../../src/common/constants/status.constants';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';

/** ConfigService stub — `get(key)` returns env[key] or undefined. */
function configStub(env: Record<string, string> = {}) {
    return {
        provide: ConfigService,
        useValue: { get: (key: string) => env[key] },
    };
}

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const validSchema = {
    pages: [
        { name: 'p1', elements: [{ name: 'q1', type: 'text', title: 'Q1' }] },
    ],
};

function mockRepo<T>(
    overrides: Partial<Record<string, jest.Mock>> = {},
): jest.Mocked<{
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    find: jest.Mock;
    remove: jest.Mock;
    update: jest.Mock;
}> {
    return {
        create: jest.fn((data) => data),
        save: jest.fn(async (entity) => ({ id: 'survey-1', ...entity })),
        findOne: jest.fn(),
        findAndCount: jest.fn(),
        find: jest.fn(),
        remove: jest.fn(async () => undefined),
        update: jest.fn(async () => ({ affected: 1 })),
        ...overrides,
    } as never;
}

describe('SurveysService', () => {
    let service: SurveysService;
    let surveyRepo: ReturnType<typeof mockRepo>;

    beforeEach(async () => {
        surveyRepo = mockRepo();

        const module = await Test.createTestingModule({
            providers: [
                SurveysService,
                SchemaValidatorService,
                LogicEngineService,
                { provide: getRepositoryToken(Survey), useValue: surveyRepo },
                configStub(),
            ],
        }).compile();

        service = module.get(SurveysService);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // create
    // ──────────────────────────────────────────────────────────────────────────

    describe('create', () => {
        it('creates a draft survey with valid schema', async () => {
            surveyRepo.save.mockResolvedValue({
                id: 'survey-1',
                name: 'Test',
                status: SurveyStatus.DRAFT,
                createdBy: 'user-1',
            });

            const survey = await service.create(ctx, {
                name: 'Test',
                schemaJson: validSchema,
            });
            expect(survey.status).toBe(SurveyStatus.DRAFT);
            expect(surveyRepo.save).toHaveBeenCalled();
        });

        it('sets createdBy from ctx.userId', async () => {
            surveyRepo.save.mockResolvedValue({
                id: 's1',
                createdBy: 'user-1',
            });
            await service.create(ctx, { name: 'Test' });
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ createdBy: 'user-1' }),
            );
        });

        it('throws BadRequestException when schema is invalid', async () => {
            await expect(
                service.create(ctx, { name: 'Test', schemaJson: {} as never }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(surveyRepo.save).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // findOne
    // ──────────────────────────────────────────────────────────────────────────

    describe('findOne', () => {
        it('returns survey when found', async () => {
            const survey = {
                id: 'survey-1',
                name: 'Test',
                status: SurveyStatus.DRAFT,
            };
            surveyRepo.findOne.mockResolvedValue(survey);

            const result = await service.findOne(ctx, 'survey-1');
            expect(result).toBe(survey);
        });

        it('throws NotFoundException when survey does not exist', async () => {
            surveyRepo.findOne.mockResolvedValue(null);
            await expect(service.findOne(ctx, 'bad-id')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // update
    // ──────────────────────────────────────────────────────────────────────────

    describe('update', () => {
        it('updates name and description', async () => {
            const existing = {
                id: 's1',
                name: 'Old',
                status: SurveyStatus.DRAFT,
                draftSchemaJson: null,
                draftLogicJson: null,
                settings: {},
            };
            surveyRepo.findOne.mockResolvedValue(existing);
            surveyRepo.save.mockResolvedValue({ ...existing, name: 'New' });

            const result = await service.update(ctx, 's1', { name: 'New' });
            expect(result.name).toBe('New');
        });

        it('throws BadRequestException when updating an archived survey', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                status: SurveyStatus.ARCHIVED,
            });
            await expect(
                service.update(ctx, 's1', { name: 'New' }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws BadRequestException when new schema is invalid', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                status: SurveyStatus.DRAFT,
                draftSchemaJson: validSchema,
                draftLogicJson: null,
                settings: {},
            });

            await expect(
                service.update(ctx, 's1', { schemaJson: {} as never }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws ForbiddenException when caller does not own the survey', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                status: SurveyStatus.DRAFT,
                createdBy: 'other-user',
            });

            await expect(
                service.update(ctx, 's1', { name: 'New' }),
            ).rejects.toThrow('You do not have access');
        });

        it('merges settings rather than replacing them', async () => {
            const existing = {
                id: 's1',
                status: SurveyStatus.DRAFT,
                createdBy: 'user-1',
                draftSchemaJson: null,
                draftLogicJson: null,
                settings: {
                    allowAnonymous: true,
                    requireAuth: false,
                    webhookUrl: 'http://old',
                },
            };
            surveyRepo.findOne.mockResolvedValue(existing);
            surveyRepo.save.mockImplementation(async (s) => s);

            await service.update(ctx, 's1', {
                settings: { webhookUrl: 'http://new' } as never,
            });

            expect(surveyRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    settings: expect.objectContaining({
                        allowAnonymous: true,
                        webhookUrl: 'http://new',
                    }),
                }),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // findAll
    // ──────────────────────────────────────────────────────────────────────────

    describe('findAll', () => {
        it('returns only own surveys for authenticated user', async () => {
            surveyRepo.findAndCount.mockResolvedValue([[{ id: 's1' }], 1]);

            await service.findAll(ctx, {});

            expect(surveyRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({ where: { createdBy: 'user-1' } }),
            );
        });

        it('returns only published surveys for unauthenticated user', async () => {
            const anonCtx = { correlationId: 'c1' };
            surveyRepo.findAndCount.mockResolvedValue([[], 0]);

            await service.findAll(anonCtx, {});

            expect(surveyRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { status: SurveyStatus.PUBLISHED },
                }),
            );
        });

        it('returns paginated metadata', async () => {
            surveyRepo.findAndCount.mockResolvedValue([
                [{ id: 's1' }, { id: 's2' }],
                55,
            ]);

            const result = await service.findAll(ctx, { page: 2, limit: 10 });

            expect(result.meta.total).toBe(55);
            expect(result.meta.page).toBe(2);
            expect(result.meta.totalPages).toBe(6);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // remove
    // ──────────────────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('removes survey when caller is owner', async () => {
            const survey = {
                id: 's1',
                createdBy: 'user-1',
                status: SurveyStatus.DRAFT,
            };
            surveyRepo.findOne.mockResolvedValue(survey);

            await service.remove(ctx, 's1');

            expect(surveyRepo.remove).toHaveBeenCalledWith(survey);
        });

        it('throws ForbiddenException when caller does not own the survey', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'other-user',
            });

            await expect(service.remove(ctx, 's1')).rejects.toThrow(
                'You do not have access',
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // assertOwner
    // ──────────────────────────────────────────────────────────────────────────

    describe('assertOwner', () => {
        it('does not throw when caller matches owner', () => {
            const survey = { id: 's1', createdBy: 'user-1' } as never;
            expect(() => service.assertOwner(survey, ctx)).not.toThrow();
        });

        it('throws ForbiddenException when owner differs from caller', () => {
            const survey = { id: 's1', createdBy: 'other' } as never;
            expect(() => service.assertOwner(survey, ctx)).toThrow(
                'You do not have access',
            );
        });

        it('does not throw when survey has no owner (default policy, STRICT_AUTH off)', () => {
            const survey = { id: 's1', createdBy: null } as never;
            expect(() => service.assertOwner(survey, ctx)).not.toThrow();
        });

        it('throws when an anonymous caller tries to mutate an identified resource', () => {
            const survey = { id: 's1', createdBy: 'someone' } as never;
            expect(() =>
                service.assertOwner(survey, { correlationId: 'c' }),
            ).toThrow(ForbiddenException);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // assertOwner under STRICT_AUTH=true
    // ──────────────────────────────────────────────────────────────────────────

    describe('assertOwner with STRICT_AUTH=true', () => {
        let strictService: SurveysService;

        beforeEach(async () => {
            const module = await Test.createTestingModule({
                providers: [
                    SurveysService,
                    SchemaValidatorService,
                    LogicEngineService,
                    {
                        provide: getRepositoryToken(Survey),
                        useValue: mockRepo(),
                    },
                    configStub({ STRICT_AUTH: 'true' }),
                ],
            }).compile();
            strictService = module.get(SurveysService);
        });

        it('forbids mutating anonymous resources', () => {
            const survey = { id: 's1', createdBy: null } as never;
            expect(() => strictService.assertOwner(survey, ctx)).toThrow(
                ForbiddenException,
            );
        });

        it('still allows the owner', () => {
            const survey = { id: 's1', createdBy: 'user-1' } as never;
            expect(() => strictService.assertOwner(survey, ctx)).not.toThrow();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // findOneVisible — controller-facing read with draft visibility filter
    // ──────────────────────────────────────────────────────────────────────────

    describe('findOneVisible', () => {
        it('returns the survey when caller is the owner (any status)', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'user-1',
                status: SurveyStatus.DRAFT,
            });
            const result = await service.findOneVisible(ctx, 's1');
            expect(result.id).toBe('s1');
        });

        it('returns published surveys to non-owners', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'other-user',
                status: SurveyStatus.PUBLISHED,
            });
            const result = await service.findOneVisible(ctx, 's1');
            expect(result.id).toBe('s1');
        });

        it('hides drafts from non-owners (404, not 403, to avoid enumeration)', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'other-user',
                status: SurveyStatus.DRAFT,
            });
            await expect(
                service.findOneVisible(ctx, 's1'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('hides archived surveys from non-owners', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'other-user',
                status: SurveyStatus.ARCHIVED,
            });
            await expect(
                service.findOneVisible(ctx, 's1'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('returns anonymous-created surveys to any caller (any status)', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: null,
                status: SurveyStatus.DRAFT,
            });
            const result = await service.findOneVisible(ctx, 's1');
            expect(result.id).toBe('s1');
        });

        it('returns the survey to an anonymous caller when status is published', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'someone',
                status: SurveyStatus.PUBLISHED,
            });
            const result = await service.findOneVisible(
                { correlationId: 'c' },
                's1',
            );
            expect(result.id).toBe('s1');
        });

        it('hides drafts from anonymous callers', async () => {
            surveyRepo.findOne.mockResolvedValue({
                id: 's1',
                createdBy: 'someone',
                status: SurveyStatus.DRAFT,
            });
            await expect(
                service.findOneVisible({ correlationId: 'c' }, 's1'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // create — with logicJson
    // ──────────────────────────────────────────────────────────────────────────

    describe('create — with logicJson', () => {
        it('allows creating a survey without a schema', async () => {
            surveyRepo.save.mockResolvedValue({
                id: 's2',
                name: 'No schema',
                status: SurveyStatus.DRAFT,
            });

            const result = await service.create(ctx, { name: 'No schema' });
            expect(result.status).toBe(SurveyStatus.DRAFT);
        });

        it('creates survey with null createdBy for anonymous context', async () => {
            surveyRepo.save.mockResolvedValue({ id: 's3', createdBy: null });
            await service.create({ correlationId: 'c' }, { name: 'Anon' });
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ createdBy: null }),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // duplicate
    // ──────────────────────────────────────────────────────────────────────────

    describe('duplicate', () => {
        const original: Survey = {
            id: 'survey-1',
            name: 'NPS Survey',
            description: 'Original description',
            createdBy: 'user-1',
            status: SurveyStatus.PUBLISHED,
            draftSchemaJson: { pages: [] },
            draftLogicJson: { version: '1.0', rules: [] },
            settings: {
                allowAnonymous: true,
                requireAuth: false,
                accessTokenRequired: false,
            },
            activeVersionId: 'v1',
            activeVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as unknown as Survey;

        beforeEach(() => {
            surveyRepo.findOne.mockResolvedValue(original);
            surveyRepo.save.mockImplementation(async (entity) => ({
                id: 'survey-copy',
                ...entity,
            }));
        });

        it('creates a copy with "(copy)" appended to the name', async () => {
            await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'NPS Survey (copy)' }),
            );
        });

        it('copies description', async () => {
            await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'Original description',
                }),
            );
        });

        it('creates a deep copy of draftSchemaJson', async () => {
            await service.duplicate(ctx, 'survey-1');
            const created = surveyRepo.create.mock.calls[0][0] as Record<
                string,
                unknown
            >;
            expect(created.draftSchemaJson).toEqual(original.draftSchemaJson);
            expect(created.draftSchemaJson).not.toBe(original.draftSchemaJson);
        });

        it('creates a deep copy of draftLogicJson', async () => {
            await service.duplicate(ctx, 'survey-1');
            const created = surveyRepo.create.mock.calls[0][0] as Record<
                string,
                unknown
            >;
            expect(created.draftLogicJson).toEqual(original.draftLogicJson);
            expect(created.draftLogicJson).not.toBe(original.draftLogicJson);
        });

        it('sets status to DRAFT regardless of original status', async () => {
            await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ status: SurveyStatus.DRAFT }),
            );
        });

        it('sets createdBy from ctx.userId', async () => {
            await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ createdBy: 'user-1' }),
            );
        });

        it('sets createdBy to null when an anonymous caller duplicates an anonymous original', async () => {
            // An anonymous caller cannot duplicate someone else's identified survey
            // (assertOwner forbids it), but an anonymous original is open to all.
            surveyRepo.findOne.mockResolvedValue({
                ...original,
                createdBy: null,
            });
            await service.duplicate({ correlationId: 'c' }, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ createdBy: null }),
            );
        });

        it('forbids an anonymous caller from duplicating an identified survey', async () => {
            await expect(
                service.duplicate({ correlationId: 'c' }, 'survey-1'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('handles null draftSchemaJson gracefully', async () => {
            surveyRepo.findOne.mockResolvedValue({
                ...original,
                draftSchemaJson: null,
            });
            await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ draftSchemaJson: null }),
            );
        });

        it('handles null draftLogicJson gracefully', async () => {
            surveyRepo.findOne.mockResolvedValue({
                ...original,
                draftLogicJson: null,
            });
            await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ draftLogicJson: null }),
            );
        });

        it('throws NotFoundException when original survey does not exist', async () => {
            surveyRepo.findOne.mockResolvedValue(null);
            await expect(
                service.duplicate(ctx, 'nonexistent'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('throws ForbiddenException when caller does not own the survey', async () => {
            await expect(
                service.duplicate(
                    { userId: 'other-user', correlationId: 'c' },
                    'survey-1',
                ),
            ).rejects.toThrow('You do not have access to this survey');
        });

        it('saves and returns the copied survey', async () => {
            const result = await service.duplicate(ctx, 'survey-1');
            expect(surveyRepo.save).toHaveBeenCalled();
            expect(result.id).toBe('survey-copy');
        });
    });
});
