import { ExportService } from '../../../src/analytics/export.service';
import type { SurveyAnalyticsDto } from '../../../src/analytics/dto';

const minimalAnalytics: SurveyAnalyticsDto = {
    surveyId: 'survey-1',
    surveyName: 'My Survey',
    generatedAt: '2024-01-01T00:00:00.000Z',
    summary: {
        totalResponses: 10,
        completedResponses: 8,
        completionRate: 80,
        avgCompletionTime: 60,
        medianCompletionTime: 55,
        responsesByStatus: { completed: 8, started: 2 },
        responsesToday: 2,
        responsesThisWeek: 8,
        versionsIncluded: [1],
    },
    funnel: {
        total: 10,
        started: 2,
        inProgress: 0,
        completed: 8,
        abandoned: 0,
        activeResponses: 2,
        staleResponses: 0,
        completionRate: 80,
        dropOffRate: 20,
        abandonmentRate: 0,
    },
    trends: { daily: [], weekly: [] },
    questions: [],
};

describe('ExportService', () => {
    let service: ExportService;

    beforeEach(() => {
        service = new ExportService();
    });

    describe('convertToCSV', () => {
        it('returns a string', () => {
            expect(typeof service.convertToCSV(minimalAnalytics)).toBe(
                'string',
            );
        });

        it('includes the survey name in the header', () => {
            const csv = service.convertToCSV(minimalAnalytics);
            expect(csv).toContain('Survey: My Survey');
        });

        it('includes the generated timestamp', () => {
            const csv = service.convertToCSV(minimalAnalytics);
            expect(csv).toContain('Generated: 2024-01-01T00:00:00.000Z');
        });

        it('includes summary statistics', () => {
            const csv = service.convertToCSV(minimalAnalytics);
            expect(csv).toContain('Total Responses,10');
            expect(csv).toContain('Completed Responses,8');
            expect(csv).toContain('Completion Rate,80%');
        });

        it('includes funnel data', () => {
            const csv = service.convertToCSV(minimalAnalytics);
            expect(csv).toContain('COMPLETION FUNNEL');
            expect(csv).toContain('Completed,8');
        });

        it('includes applied filters section when filters are present', () => {
            const analytics: SurveyAnalyticsDto = {
                ...minimalAnalytics,
                appliedFilters: {
                    dateRange: {
                        startDate: '2024-01-01',
                        endDate: '2024-12-31',
                    },
                    versionMode: undefined,
                    versionId: undefined,
                },
            };
            const csv = service.convertToCSV(analytics);
            expect(csv).toContain('APPLIED FILTERS');
            expect(csv).toContain('Date Range: 2024-01-01 to 2024-12-31');
        });

        it('includes question analytics for choice questions', () => {
            const analytics: SurveyAnalyticsDto = {
                ...minimalAnalytics,
                questions: [
                    {
                        questionId: 'q1',
                        questionType: 'radiogroup',
                        questionTitle: 'Favorite color?',
                        totalAnswers: 5,
                        skipped: 0,
                        isLegacy: false,
                        distribution: [
                            {
                                value: 'red',
                                label: 'Red',
                                count: 3,
                                percentage: 60,
                                isLegacy: false,
                            },
                            {
                                value: 'blue',
                                label: 'Blue',
                                count: 2,
                                percentage: 40,
                                isLegacy: false,
                            },
                        ],
                    },
                ],
            };
            const csv = service.convertToCSV(analytics);
            expect(csv).toContain('Question: Favorite color?');
            expect(csv).toContain('"Red",3,60%');
        });

        it('marks legacy questions with [LEGACY]', () => {
            const analytics: SurveyAnalyticsDto = {
                ...minimalAnalytics,
                questions: [
                    {
                        questionId: 'q-old',
                        questionType: 'text',
                        questionTitle: 'Old question',
                        totalAnswers: 2,
                        skipped: 8,
                        isLegacy: true,
                    },
                ],
            };
            const csv = service.convertToCSV(analytics);
            expect(csv).toContain('[LEGACY]');
        });
    });
});
