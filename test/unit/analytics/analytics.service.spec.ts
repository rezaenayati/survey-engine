import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from '../../../src/analytics/analytics.service';
import { AggregationService } from '../../../src/analytics/aggregation.service';
import { QuestionAnalyticsService } from '../../../src/analytics/question-analytics.service';
import { ExportService } from '../../../src/analytics/export.service';
import { SurveysService } from '../../../src/surveys/surveys.service';
import { VersionMode } from '../../../src/analytics/dto';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const mockSurvey = { id: 'survey-1', name: 'Test Survey', createdBy: 'user-1' };

const mockQb = {
    clone: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
};

const mockSurveysService = {
    findOne: jest.fn().mockResolvedValue(mockSurvey),
    assertOwner: jest.fn(),
};

const mockAggregationService = {
    buildBaseQuery: jest.fn().mockReturnValue(mockQb),
    calculateSummaryDB: jest
        .fn()
        .mockResolvedValue({
            totalResponses: 10,
            completionRate: 80,
            completedResponses: 8,
            avgCompletionTime: 60,
            medianCompletionTime: 55,
            responsesByStatus: {},
            responsesToday: 1,
            responsesThisWeek: 5,
            versionsIncluded: [1],
        }),
    calculateFunnelDB: jest
        .fn()
        .mockResolvedValue({
            total: 10,
            started: 2,
            inProgress: 2,
            completed: 8,
            abandoned: 0,
            activeResponses: 4,
            staleResponses: 0,
            completionRate: 80,
            dropOffRate: 20,
            abandonmentRate: 0,
        }),
    calculateTrendsDB: jest.fn().mockResolvedValue({ daily: [], weekly: [] }),
    buildAppliedFilters: jest.fn().mockReturnValue({}),
};

const mockQuestionAnalyticsService = {
    getRelevantVersions: jest.fn().mockResolvedValue([{ versionNumber: 1 }]),
    calculateQuestionAnalyticsDB: jest.fn().mockResolvedValue([]),
    getTextResponses: jest
        .fn()
        .mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0,
            hasMore: false,
        }),
};

const mockExportService = {
    convertToCSV: jest.fn().mockReturnValue('csv-data'),
};

describe('AnalyticsService', () => {
    let service: AnalyticsService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module = await Test.createTestingModule({
            providers: [
                AnalyticsService,
                { provide: SurveysService, useValue: mockSurveysService },
                {
                    provide: AggregationService,
                    useValue: mockAggregationService,
                },
                {
                    provide: QuestionAnalyticsService,
                    useValue: mockQuestionAnalyticsService,
                },
                { provide: ExportService, useValue: mockExportService },
            ],
        }).compile();

        service = module.get(AnalyticsService);
    });

    describe('getAnalytics', () => {
        it('resolves the survey and asserts ownership before computing', async () => {
            await service.getAnalytics(ctx, 'survey-1', {});

            expect(mockSurveysService.findOne).toHaveBeenCalledWith(
                ctx,
                'survey-1',
            );
            expect(mockSurveysService.assertOwner).toHaveBeenCalledWith(
                mockSurvey,
                ctx,
            );
        });

        it('throws BadRequestException when versionMode is SPECIFIC but versionId is absent', async () => {
            await expect(
                service.getAnalytics(ctx, 'survey-1', {
                    versionMode: VersionMode.SPECIFIC,
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('delegates to all three sub-services in parallel', async () => {
            await service.getAnalytics(ctx, 'survey-1', {});

            expect(
                mockAggregationService.calculateSummaryDB,
            ).toHaveBeenCalled();
            expect(mockAggregationService.calculateFunnelDB).toHaveBeenCalled();
            expect(mockAggregationService.calculateTrendsDB).toHaveBeenCalled();
            expect(
                mockQuestionAnalyticsService.calculateQuestionAnalyticsDB,
            ).toHaveBeenCalled();
        });

        it('returns a SurveyAnalyticsDto with the survey name and generated timestamp', async () => {
            const result = await service.getAnalytics(ctx, 'survey-1', {});

            expect(result.surveyId).toBe('survey-1');
            expect(result.surveyName).toBe('Test Survey');
            expect(result.generatedAt).toBeDefined();
        });
    });

    describe('getSummary', () => {
        it('throws NotFoundException (from SurveysService) when survey does not exist', async () => {
            mockSurveysService.findOne.mockRejectedValueOnce(
                new Error('Not found'),
            );

            await expect(service.getSummary(ctx, 'bad-id', {})).rejects.toThrow(
                'Not found',
            );
        });

        it('returns summary from aggregationService', async () => {
            const result = await service.getSummary(ctx, 'survey-1', {});

            expect(
                mockAggregationService.calculateSummaryDB,
            ).toHaveBeenCalled();
            expect(result.totalResponses).toBe(10);
        });
    });

    describe('getFunnel', () => {
        it('returns funnel data from aggregationService', async () => {
            const result = await service.getFunnel(ctx, 'survey-1', {});

            expect(mockAggregationService.calculateFunnelDB).toHaveBeenCalled();
            expect(result.total).toBe(10);
        });
    });

    describe('getTextResponses', () => {
        it('delegates to questionAnalyticsService', async () => {
            await service.getTextResponses(ctx, 'survey-1', 'q1', {
                page: 1,
                limit: 10,
            });

            expect(
                mockQuestionAnalyticsService.getTextResponses,
            ).toHaveBeenCalledWith(ctx, 'survey-1', 'q1', {
                page: 1,
                limit: 10,
            });
        });
    });

    describe('exportAnalytics', () => {
        it('returns CSV data when format is "csv"', async () => {
            const result = await service.exportAnalytics(
                ctx,
                'survey-1',
                {},
                'csv',
            );

            expect(mockExportService.convertToCSV).toHaveBeenCalled();
            expect(result.contentType).toBe('text/csv');
            expect(result.data).toBe('csv-data');
        });

        it('returns JSON data when format is "json"', async () => {
            const result = await service.exportAnalytics(
                ctx,
                'survey-1',
                {},
                'json',
            );

            expect(mockExportService.convertToCSV).not.toHaveBeenCalled();
            expect(result.contentType).toBe('application/json');
            expect(result.filename).toMatch(
                /survey-analytics-survey-1-\d+\.json/,
            );
        });
    });
});
