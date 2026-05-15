import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AggregationService } from '../../../src/analytics/aggregation.service';
import { Response } from '../../../src/responses/entities/response.entity';
import { ResponseStatus } from '../../../src/common/constants/status.constants';
import { VersionMode, FilterOperator } from '../../../src/analytics/dto';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';
import type { SelectQueryBuilder } from 'typeorm';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

/**
 * Creates a mock that chains all query-builder methods back to itself so that
 * `.select().clone().groupBy().setParameters().getRawOne()` works without
 * having to set up a deep prototype chain.
 */
function createQbMock(overrides: Record<string, jest.Mock> = {}) {
  const qb: Record<string, jest.Mock> = {
    where: jest.fn(),
    andWhere: jest.fn(),
    select: jest.fn(),
    clone: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    setParameters: jest.fn(),
    getQuery: jest.fn().mockReturnValue('SELECT r.id FROM response r WHERE r.surveyId = :surveyId'),
    getParameters: jest.fn().mockReturnValue({ surveyId: 'survey-1' }),
    getRawOne: jest.fn().mockResolvedValue({}),
    getRawMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  for (const method of ['where', 'andWhere', 'select', 'clone', 'groupBy', 'orderBy',
    'offset', 'limit', 'setParameters']) {
    if (!overrides[method]) qb[method].mockReturnValue(qb);
  }
  return qb as unknown as jest.Mocked<SelectQueryBuilder<Response>>;
}

function mockResponseRepo(qbOverrides: Record<string, jest.Mock> = {}) {
  const qb = createQbMock(qbOverrides);
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  };
}

describe('AggregationService', () => {
  let service: AggregationService;
  let repoMock: ReturnType<typeof mockResponseRepo>;

  beforeEach(async () => {
    repoMock = mockResponseRepo();

    const module = await Test.createTestingModule({
      providers: [
        AggregationService,
        { provide: getRepositoryToken(Response), useValue: repoMock },
      ],
    }).compile();

    service = module.get(AggregationService);
  });

  // ── calculateMedian ───────────────────────────────────────────────────────

  describe('calculateMedian', () => {
    it('returns 0 for an empty array', () => {
      expect(service.calculateMedian([])).toBe(0);
    });

    it('returns the middle element for an odd-length array', () => {
      expect(service.calculateMedian([3, 1, 2])).toBe(2);
    });

    it('returns the average of the two middle elements for an even-length array', () => {
      expect(service.calculateMedian([1, 4, 2, 3])).toBe(2.5);
    });

    it('handles a single-element array', () => {
      expect(service.calculateMedian([42])).toBe(42);
    });
  });

  // ── buildAppliedFilters ───────────────────────────────────────────────────

  describe('buildAppliedFilters', () => {
    it('returns empty filter object when no query options are set', () => {
      const result = service.buildAppliedFilters({});
      expect(result.dateRange).toBeUndefined();
      expect(result.answerFilters).toBeUndefined();
      expect(result.respondentIdsCount).toBeUndefined();
    });

    it('includes dateRange when startDate is provided', () => {
      const result = service.buildAppliedFilters({ startDate: '2024-01-01' });
      expect(result.dateRange).toEqual({ startDate: '2024-01-01', endDate: undefined });
    });

    it('includes dateRange when endDate is provided', () => {
      const result = service.buildAppliedFilters({ endDate: '2024-12-31' });
      expect(result.dateRange).toEqual({ startDate: undefined, endDate: '2024-12-31' });
    });

    it('omits dateRange when neither startDate nor endDate is set', () => {
      const result = service.buildAppliedFilters({ versionMode: VersionMode.COMBINED });
      expect(result.dateRange).toBeUndefined();
    });

    it('includes respondentIdsCount when respondentIds are provided', () => {
      const result = service.buildAppliedFilters({ respondentIds: ['u1', 'u2'] });
      expect(result.respondentIdsCount).toBe(2);
    });

    it('reflects answerFilters in the result', () => {
      const filters = [{ questionId: 'q1', operator: 'equals' as never, value: 'yes' }];
      const result = service.buildAppliedFilters({ answerFilters: filters });
      expect(result.answerFilters).toEqual(filters);
    });

    it('reflects versionMode in the result', () => {
      const result = service.buildAppliedFilters({ versionMode: VersionMode.SPECIFIC, versionId: 'v-1' });
      expect(result.versionMode).toBe(VersionMode.SPECIFIC);
      expect(result.versionId).toBe('v-1');
    });
  });

  // ── buildBaseQuery ────────────────────────────────────────────────────────

  describe('buildBaseQuery', () => {
    it('always filters by surveyId', () => {
      service.buildBaseQuery(ctx, 'survey-1', {});
      expect(repoMock.createQueryBuilder).toHaveBeenCalledWith('r');
      expect(repoMock._qb.where).toHaveBeenCalledWith('r.surveyId = :surveyId', { surveyId: 'survey-1' });
    });

    it('applies startDate filter when provided', () => {
      service.buildBaseQuery(ctx, 'survey-1', { startDate: '2024-01-01' });
      expect(repoMock._qb.andWhere).toHaveBeenCalledWith(
        'r.startedAt >= :startDate',
        expect.objectContaining({ startDate: expect.any(Date) }),
      );
    });

    it('applies endDate filter when provided', () => {
      service.buildBaseQuery(ctx, 'survey-1', { endDate: '2024-12-31' });
      expect(repoMock._qb.andWhere).toHaveBeenCalledWith(
        'r.startedAt <= :endDate',
        expect.objectContaining({ endDate: expect.any(Date) }),
      );
    });

    it('does not apply date filters when absent', () => {
      service.buildBaseQuery(ctx, 'survey-1', {});
      const calls = (repoMock._qb.andWhere as jest.Mock).mock.calls.map(([sql]: [string]) => sql);
      expect(calls.some((c: string) => c.includes('startedAt'))).toBe(false);
    });

    it('applies specific version filter when versionMode is SPECIFIC', () => {
      service.buildBaseQuery(ctx, 'survey-1', {
        versionMode: VersionMode.SPECIFIC,
        versionId: 'ver-1',
      });
      expect(repoMock._qb.andWhere).toHaveBeenCalledWith(
        'r.surveyVersionId = :versionId',
        { versionId: 'ver-1' },
      );
    });

    it('does not apply version filter for COMBINED mode', () => {
      service.buildBaseQuery(ctx, 'survey-1', { versionMode: VersionMode.COMBINED });
      const calls = (repoMock._qb.andWhere as jest.Mock).mock.calls.map(([sql]: [string]) => sql);
      expect(calls.some((c: string) => c.includes('surveyVersionId'))).toBe(false);
    });

    it('applies respondentIds filter when provided', () => {
      service.buildBaseQuery(ctx, 'survey-1', { respondentIds: ['r1', 'r2'] });
      expect(repoMock._qb.andWhere).toHaveBeenCalledWith(
        'r.respondentId IN (:...respondentIds)',
        { respondentIds: ['r1', 'r2'] },
      );
    });
  });

  // ── calculateSummaryDB ────────────────────────────────────────────────────

  describe('calculateSummaryDB', () => {
    it('computes completionRate as completed / total × 100', async () => {
      const qb = createQbMock();
      (qb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '10', completed: '8', avg_time: '60' })
        .mockResolvedValueOnce({ today: '2', this_week: '5' });
      (qb.getRawMany as jest.Mock).mockResolvedValueOnce([
        { status: ResponseStatus.COMPLETED, count: '8' },
        { status: ResponseStatus.STARTED, count: '2' },
      ]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const result = await service.calculateSummaryDB(qb, [1]);

      expect(result.totalResponses).toBe(10);
      expect(result.completedResponses).toBe(8);
      expect(result.completionRate).toBe(80);
      expect(result.avgCompletionTime).toBe(60);
    });

    it('returns 0 completionRate when totalResponses is 0', async () => {
      const qb = createQbMock();
      (qb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '0', completed: '0', avg_time: null })
        .mockResolvedValueOnce({ today: '0', this_week: '0' });
      (qb.getRawMany as jest.Mock).mockResolvedValueOnce([]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const result = await service.calculateSummaryDB(qb, [1]);

      expect(result.totalResponses).toBe(0);
      expect(result.completionRate).toBe(0);
    });

    it('includes versionsIncluded in result', async () => {
      const qb = createQbMock();
      (qb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '5', completed: '5', avg_time: '30' })
        .mockResolvedValueOnce({ today: '1', this_week: '5' });
      (qb.getRawMany as jest.Mock).mockResolvedValueOnce([]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const result = await service.calculateSummaryDB(qb, [1, 2, 3]);

      expect(result.versionsIncluded).toEqual([1, 2, 3]);
    });
  });

  // ── calculateFunnelDB ─────────────────────────────────────────────────────

  describe('calculateFunnelDB', () => {
    it('calculates completion and abandonment rates', async () => {
      const qb = createQbMock();
      (qb.getRawOne as jest.Mock).mockResolvedValueOnce({
        total: '20', started: '5', in_progress: '3', completed: '10', abandoned: '2', stale: '1',
      });

      const result = await service.calculateFunnelDB(qb, 7);

      expect(result.total).toBe(20);
      expect(result.started).toBe(5);
      expect(result.inProgress).toBe(3);
      expect(result.completed).toBe(10);
      expect(result.abandoned).toBe(2);
      expect(result.activeResponses).toBe(8);
      expect(result.staleResponses).toBe(1);
      expect(result.completionRate).toBe(50);
      expect(result.abandonmentRate).toBe(10);
    });

    it('returns 0 rates when total is 0', async () => {
      const qb = createQbMock();
      (qb.getRawOne as jest.Mock).mockResolvedValueOnce({
        total: '0', started: '0', in_progress: '0', completed: '0', abandoned: '0', stale: '0',
      });

      const result = await service.calculateFunnelDB(qb, 7);

      expect(result.completionRate).toBe(0);
      expect(result.dropOffRate).toBe(0);
      expect(result.abandonmentRate).toBe(0);
    });

    it('computes dropOffRate as (total - completed) / total', async () => {
      const qb = createQbMock();
      (qb.getRawOne as jest.Mock).mockResolvedValueOnce({
        total: '10', started: '2', in_progress: '2', completed: '6', abandoned: '0', stale: '0',
      });

      const result = await service.calculateFunnelDB(qb, 7);

      expect(result.dropOffRate).toBe(40);
    });
  });

  // ── calculateTrendsDB ─────────────────────────────────────────────────────

  describe('calculateTrendsDB', () => {
    it('returns daily and weekly trend arrays', async () => {
      const qb = createQbMock();
      (qb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([
          { date: '2026-05-01', count: '5', completed: '3' },
          { date: '2026-05-02', count: '8', completed: '6' },
        ])
        .mockResolvedValueOnce([
          { date: '2026-04-28', count: '13', completed: '9' },
        ]);

      const result = await service.calculateTrendsDB(qb);

      expect(result.daily).toHaveLength(2);
      expect(result.daily[0]).toEqual({ date: '2026-05-01', count: 5, completed: 3 });
      expect(result.weekly).toHaveLength(1);
      expect(result.weekly[0]).toEqual({ date: '2026-04-28', count: 13, completed: 9 });
    });

    it('returns empty arrays when no data', async () => {
      const qb = createQbMock();
      (qb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.calculateTrendsDB(qb);

      expect(result.daily).toHaveLength(0);
      expect(result.weekly).toHaveLength(0);
    });
  });

  // ── buildBaseQuery — answer filters ───────────────────────────────────────

  describe('buildBaseQuery — answer filters', () => {
    async function makeService() {
      const repo = mockResponseRepo();
      const module = await Test.createTestingModule({
        providers: [
          AggregationService,
          { provide: getRepositoryToken(Response), useValue: repo },
        ],
      }).compile();
      return { svc: module.get(AggregationService), repo };
    }

    const scalarCases: Array<{ operator: FilterOperator; label: string; expectedSql: string }> = [
      { operator: FilterOperator.EQUALS, label: 'EQUALS', expectedSql: '= :answerFilter0' },
      { operator: FilterOperator.CONTAINS, label: 'CONTAINS', expectedSql: 'ILIKE :answerFilter0' },
      { operator: FilterOperator.GT, label: 'GT', expectedSql: '> :answerFilter0' },
      { operator: FilterOperator.LT, label: 'LT', expectedSql: '< :answerFilter0' },
      { operator: FilterOperator.GTE, label: 'GTE', expectedSql: '>= :answerFilter0' },
      { operator: FilterOperator.LTE, label: 'LTE', expectedSql: '<= :answerFilter0' },
    ];

    for (const { operator, label, expectedSql } of scalarCases) {
      it(`applies ${label} operator filter`, async () => {
        const { svc, repo } = await makeService();

        svc.buildBaseQuery(ctx, 'survey-1', {
          answerFilters: [{ questionId: 'q1', operator, value: 'testval' }],
        });

        const allCalls = (repo._qb.andWhere as jest.Mock).mock.calls.map(([sql]: [string]) => sql);
        expect(allCalls.some((s: string) => typeof s === 'string' && s.includes(expectedSql))).toBe(true);
      });
    }

    it('applies NOT_EQUALS operator filter (uses Brackets)', async () => {
      const { svc, repo } = await makeService();

      svc.buildBaseQuery(ctx, 'survey-1', {
        answerFilters: [{ questionId: 'q1', operator: FilterOperator.NOT_EQUALS, value: 'testval' }],
      });

      // NOT_EQUALS wraps conditions in Brackets, so andWhere is called with a Brackets object
      expect(repo._qb.andWhere).toHaveBeenCalled();
    });

    it('applies IN operator with array value', async () => {
      const { svc, repo } = await makeService();

      svc.buildBaseQuery(ctx, 'survey-1', {
        answerFilters: [{ questionId: 'q1', operator: FilterOperator.IN, value: ['a', 'b'] }],
      });

      const allCalls = (repo._qb.andWhere as jest.Mock).mock.calls.map(([sql]: [string]) => sql);
      expect(allCalls.some((s: string) => s.includes('IN (:...answerFilter0)'))).toBe(true);
    });

    it('skips IN operator when value is not an array', async () => {
      const { svc, repo } = await makeService();

      svc.buildBaseQuery(ctx, 'survey-1', {
        answerFilters: [{ questionId: 'q1', operator: FilterOperator.IN, value: 'not-array' }],
      });

      const allCalls = (repo._qb.andWhere as jest.Mock).mock.calls.map(([sql]: [string]) => sql);
      expect(allCalls.some((s: string) => s.includes('IN (:...answerFilter0)'))).toBe(false);
    });
  });
});
