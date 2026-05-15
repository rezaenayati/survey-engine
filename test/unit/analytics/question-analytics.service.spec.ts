import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuestionAnalyticsService } from '../../../src/analytics/question-analytics.service';
import { AggregationService } from '../../../src/analytics/aggregation.service';
import { Response } from '../../../src/responses/entities/response.entity';
import { SurveyVersion } from '../../../src/surveys/entities/survey-version.entity';
import { VersionMode } from '../../../src/analytics/dto';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';
import type { SelectQueryBuilder } from 'typeorm';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const baseSchema = {
  pages: [
    {
      name: 'p1',
      elements: [
        { name: 'q_radio', type: 'radiogroup', title: 'Pick one', choices: [{ value: 'a', text: 'Option A' }, { value: 'b', text: 'Option B' }] },
        { name: 'q_check', type: 'checkbox', title: 'Pick many', choices: [{ value: 'x', text: 'X' }, { value: 'y', text: 'Y' }] },
        { name: 'q_rating', type: 'rating', title: 'Rate it' },
        { name: 'q_bool', type: 'boolean', title: 'Yes/No' },
        { name: 'q_text', type: 'text', title: 'Open text' },
        { name: 'q_comment', type: 'comment', title: 'Comment' },
        { name: 'q_other', type: 'matrix', title: 'Matrix' },
      ],
    },
  ],
};

const makeVersion = (versionNumber: number, schema = baseSchema): SurveyVersion =>
  ({ id: `v${versionNumber}`, surveyId: 'survey-1', versionNumber, schemaJson: schema as never, logicJson: null, checksum: 'x', isDeprecated: false, createdAt: new Date() } as unknown as SurveyVersion);

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
  for (const m of ['where', 'andWhere', 'select', 'clone', 'groupBy', 'orderBy', 'offset', 'limit', 'setParameters']) {
    if (!overrides[m]) qb[m].mockReturnValue(qb);
  }
  return qb as unknown as jest.Mocked<SelectQueryBuilder<Response>>;
}

describe('QuestionAnalyticsService', () => {
  let service: QuestionAnalyticsService;
  let versionRepo: { findOne: jest.Mock; find: jest.Mock };
  let responseRepo: { createQueryBuilder: jest.Mock };
  let aggregationService: jest.Mocked<Pick<AggregationService, 'buildBaseQuery' | 'calculateMedian'>>;
  let baseQb: jest.Mocked<SelectQueryBuilder<Response>>;

  beforeEach(async () => {
    baseQb = createQbMock();
    versionRepo = { findOne: jest.fn(), find: jest.fn() };
    responseRepo = { createQueryBuilder: jest.fn().mockReturnValue(baseQb) };
    aggregationService = {
      buildBaseQuery: jest.fn().mockReturnValue(baseQb),
      calculateMedian: jest.fn().mockReturnValue(0),
    };

    const module = await Test.createTestingModule({
      providers: [
        QuestionAnalyticsService,
        { provide: getRepositoryToken(Response), useValue: responseRepo },
        { provide: getRepositoryToken(SurveyVersion), useValue: versionRepo },
        { provide: AggregationService, useValue: aggregationService },
      ],
    }).compile();

    service = module.get(QuestionAnalyticsService);
  });

  // ── getRelevantVersions ───────────────────────────────────────────────────

  describe('getRelevantVersions', () => {
    it('returns all versions in COMBINED mode', async () => {
      const versions = [makeVersion(1), makeVersion(2)];
      versionRepo.find.mockResolvedValue(versions);

      const result = await service.getRelevantVersions('survey-1', { versionMode: VersionMode.COMBINED });

      expect(versionRepo.find).toHaveBeenCalledWith({
        where: { surveyId: 'survey-1' },
        order: { versionNumber: 'ASC' },
      });
      expect(result).toEqual(versions);
    });

    it('returns a single version in SPECIFIC mode', async () => {
      const version = makeVersion(2);
      versionRepo.findOne.mockResolvedValue(version);

      const result = await service.getRelevantVersions('survey-1', { versionMode: VersionMode.SPECIFIC, versionId: 'v2' });

      expect(versionRepo.findOne).toHaveBeenCalledWith({ where: { id: 'v2', surveyId: 'survey-1' } });
      expect(result).toEqual([version]);
    });

    it('returns empty array when specific version not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);
      const result = await service.getRelevantVersions('survey-1', { versionMode: VersionMode.SPECIFIC, versionId: 'missing' });
      expect(result).toEqual([]);
    });

    it('falls back to all versions when no versionMode is given', async () => {
      versionRepo.find.mockResolvedValue([makeVersion(1)]);
      await service.getRelevantVersions('survey-1', {});
      expect(versionRepo.find).toHaveBeenCalled();
    });
  });

  // ── calculateQuestionAnalyticsDB — empty versions ──────────────────────────

  describe('calculateQuestionAnalyticsDB — empty versions', () => {
    it('returns empty array when no versions provided', async () => {
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, []);
      expect(result).toEqual([]);
    });
  });

  // ── calculateQuestionAnalyticsDB — question type dispatch ─────────────────

  describe('calculateQuestionAnalyticsDB — question type dispatch', () => {
    beforeEach(() => {
      // total completed = 5
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '5' });
      // answered count per question = 4
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '5', answered: '4' });
    });

    it('produces one entry per question in the schema', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '3', answered: '3' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      const versions = [makeVersion(1)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      expect(result.length).toBe(7); // 7 questions in baseSchema
    });

    it('sets questionType correctly on each entry', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '2', answered: '2' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      const versions = [makeVersion(1)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const types = result.map((q) => q.questionType);
      expect(types).toContain('radiogroup');
      expect(types).toContain('checkbox');
      expect(types).toContain('rating');
      expect(types).toContain('boolean');
      expect(types).toContain('text');
      expect(types).toContain('comment');
      expect(types).toContain('matrix');
    });
  });

  // ── choice questions ──────────────────────────────────────────────────────

  describe('choice question (radiogroup)', () => {
    const radioSchema = {
      pages: [{
        name: 'p1',
        elements: [{ name: 'q_radio', type: 'radiogroup', title: 'Pick one', choices: [{ value: 'a', text: 'Option A' }, { value: 'b', text: 'Option B' }] }],
      }],
    };

    it('builds distribution from answer counts', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '2', answered: '2' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([{ answer: 'a' }, { answer: 'a' }, { answer: 'b' }]);

      const versions = [makeVersion(1, radioSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      expect(q.distribution).toBeDefined();
      const distA = q.distribution!.find((d) => d.value === 'a');
      expect(distA!.count).toBe(2);
    });

    it('includes zero-count choices from the schema', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '1', answered: '1' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([{ answer: 'a' }]);

      const versions = [makeVersion(1, radioSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      const distB = q.distribution!.find((d) => d.value === 'b');
      expect(distB).toBeDefined();
      expect(distB!.count).toBe(0);
    });

    it('calculates percentage correctly', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '2', answered: '2' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([{ answer: 'a' }, { answer: 'a' }, { answer: 'b' }]);

      const versions = [makeVersion(1, radioSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const distA = result[0].distribution!.find((d) => d.value === 'a');
      expect(distA!.percentage).toBeCloseTo(66.7, 0);
    });
  });

  // ── checkbox (multiple answers per row) ───────────────────────────────────

  describe('checkbox question (multi-select)', () => {
    const checkSchema = {
      pages: [{
        name: 'p1',
        elements: [{ name: 'q_check', type: 'checkbox', title: 'Pick many', choices: [{ value: 'x', text: 'X' }, { value: 'y', text: 'Y' }] }],
      }],
    };

    it('counts each selected value from array answers', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '2', answered: '2' });
      // Two respondents: first picked [x, y], second picked [x]
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([{ answer: ['x', 'y'] }, { answer: ['x'] }]);

      const versions = [makeVersion(1, checkSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const dist = result[0].distribution!;
      expect(dist.find((d) => d.value === 'x')!.count).toBe(2);
      expect(dist.find((d) => d.value === 'y')!.count).toBe(1);
    });
  });

  // ── rating questions ──────────────────────────────────────────────────────

  describe('rating question', () => {
    const ratingSchema = {
      pages: [{ name: 'p1', elements: [{ name: 'q_rating', type: 'rating', title: 'Rate it' }] }],
    };

    it('returns average, min, max from DB stats', async () => {
      // getRawOne call order: 1=total, 2=answered, 3=stats
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '3' })
        .mockResolvedValueOnce({ answered: '3' })
        .mockResolvedValueOnce({ avg: '4.5', min: '3', max: '5', stddev: '0.7' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([
        { value: '3', count: '1' },
        { value: '5', count: '2' },
      ]);
      aggregationService.calculateMedian.mockReturnValue(5);

      const versions = [makeVersion(1, ratingSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      expect(q.average).toBe(4.5);
      expect(q.min).toBe(3);
      expect(q.max).toBe(5);
      expect(q.stdDeviation).toBe(0.7);
      expect(q.median).toBe(5);
    });

    it('handles empty stats gracefully', async () => {
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '0' })
        .mockResolvedValueOnce({ answered: '0' })
        .mockResolvedValueOnce({});
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      const versions = [makeVersion(1, ratingSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      expect(q.average).toBeUndefined();
      expect(q.median).toBe(0);
    });
  });

  // ── boolean questions ─────────────────────────────────────────────────────

  describe('boolean question', () => {
    const boolSchema = {
      pages: [{ name: 'p1', elements: [{ name: 'q_bool', type: 'boolean', title: 'Yes/No' }] }],
    };

    it('returns trueCount and falseCount', async () => {
      // getRawOne order: 1=total, 2=answered, 3=true/false counts
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '5' })
        .mockResolvedValueOnce({ answered: '5' })
        .mockResolvedValueOnce({ true_count: '3', false_count: '2' });

      const versions = [makeVersion(1, boolSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      expect(q.trueCount).toBe(3);
      expect(q.falseCount).toBe(2);
    });

    it('builds Yes/No distribution with percentages', async () => {
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '10' })
        .mockResolvedValueOnce({ answered: '10' })
        .mockResolvedValueOnce({ true_count: '7', false_count: '3' });

      const versions = [makeVersion(1, boolSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const dist = result[0].distribution!;
      expect(dist.find((d) => d.value === 'true')!.percentage).toBe(70);
      expect(dist.find((d) => d.value === 'false')!.percentage).toBe(30);
    });
  });

  // ── text / comment questions ──────────────────────────────────────────────

  describe('text question', () => {
    const textSchema = {
      pages: [{ name: 'p1', elements: [{ name: 'q_text', type: 'text', title: 'Open text' }] }],
    };

    it('returns wordFrequency sorted by count', async () => {
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '3', answered: '3' })
        .mockResolvedValueOnce({ avg_length: '20', total_text_responses: '3' });
      (baseQb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([
          { text: 'great product love great' },
          { text: 'great experience' },
        ])
        .mockResolvedValueOnce([{ text: 'great product' }]);

      const versions = [makeVersion(1, textSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      expect(q.wordFrequency).toBeDefined();
      const topWord = q.wordFrequency![0];
      expect(topWord.word).toBe('great');
      expect(topWord.count).toBeGreaterThan(1);
    });

    it('excludes stop words from word frequency', async () => {
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '1', answered: '1' })
        .mockResolvedValueOnce({ avg_length: '15', total_text_responses: '1' });
      (baseQb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([{ text: 'the best product in the world' }])
        .mockResolvedValueOnce([{ text: 'best product' }]);

      const versions = [makeVersion(1, textSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const words = result[0].wordFrequency!.map((w) => w.word);
      expect(words).not.toContain('the');
      expect(words).not.toContain('in');
      expect(words).toContain('best');
      expect(words).toContain('product');
    });

    it('truncates recentResponses to 200 characters', async () => {
      const longText = 'a'.repeat(250);
      (baseQb.getRawOne as jest.Mock)
        .mockResolvedValueOnce({ total: '1', answered: '1' })
        .mockResolvedValueOnce({ avg_length: '250', total_text_responses: '1' });
      (baseQb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([{ text: longText }])
        .mockResolvedValueOnce([{ text: longText }]);

      const versions = [makeVersion(1, textSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      expect(result[0].recentResponses![0]).toHaveLength(203); // 200 + '...'
      expect(result[0].recentResponses![0]).toMatch(/\.\.\.$/);
    });
  });

  // ── unknown question type — returns base only ─────────────────────────────

  describe('unknown question type', () => {
    const matrixSchema = {
      pages: [{ name: 'p1', elements: [{ name: 'q_other', type: 'matrix', title: 'Matrix' }] }],
    };

    it('returns base analytics without distribution or stats', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '5', answered: '3' });

      const versions = [makeVersion(1, matrixSchema)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const q = result[0];
      expect(q.questionId).toBe('q_other');
      expect(q.questionType).toBe('matrix');
      expect(q.distribution).toBeUndefined();
      expect(q.average).toBeUndefined();
    });
  });

  // ── mergeQuestionsAcrossVersions ──────────────────────────────────────────

  describe('cross-version merging', () => {
    it('retains questions from both versions', async () => {
      const schemaV1 = {
        pages: [{ name: 'p1', elements: [{ name: 'q1', type: 'text', title: 'Q1 old' }] }],
      };
      const schemaV2 = {
        pages: [{ name: 'p1', elements: [{ name: 'q2', type: 'text', title: 'Q2' }] }],
      };

      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '2', answered: '2' });
      (baseQb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([{ text: 'hello' }])
        .mockResolvedValueOnce([{ text: 'hello' }])
        .mockResolvedValueOnce([{ text: 'world' }])
        .mockResolvedValueOnce([{ text: 'world' }]);

      const versions = [makeVersion(1, schemaV1), makeVersion(2, schemaV2)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const ids = result.map((q) => q.questionId);
      expect(ids).toContain('q1');
      expect(ids).toContain('q2');
    });

    it('marks questions only in older versions as legacy', async () => {
      const schemaV1 = {
        pages: [{ name: 'p1', elements: [{ name: 'old_q', type: 'text', title: 'Old Q' }] }],
      };
      const schemaV2 = {
        pages: [{ name: 'p1', elements: [{ name: 'new_q', type: 'text', title: 'New Q' }] }],
      };

      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '2', answered: '1' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([{ text: 'sample' }]);

      const versions = [makeVersion(1, schemaV1), makeVersion(2, schemaV2)];
      const result = await service.calculateQuestionAnalyticsDB(ctx, 'survey-1', {}, versions);

      const oldQ = result.find((q) => q.questionId === 'old_q');
      const newQ = result.find((q) => q.questionId === 'new_q');
      expect(oldQ?.isLegacy).toBe(true);
      expect(newQ?.isLegacy).toBe(false);
    });
  });

  // ── getTextResponses ──────────────────────────────────────────────────────

  describe('getTextResponses', () => {
    beforeEach(() => {
      versionRepo.find.mockResolvedValue([makeVersion(1)]);
    });

    it('returns paginated text responses', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '3' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([
        { responseId: 'r1', text: 'hello', submittedAt: new Date().toISOString(), respondentId: 'u1' },
        { responseId: 'r2', text: 'world', submittedAt: new Date().toISOString(), respondentId: null },
      ]);

      const result = await service.getTextResponses(ctx, 'survey-1', 'q_text', { page: 1, limit: 20 });

      expect(result.questionId).toBe('q_text');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
    });

    it('applies search filter when provided', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '1' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      await service.getTextResponses(ctx, 'survey-1', 'q_text', { search: 'hello' });

      const andWhereCalls = (baseQb.andWhere as jest.Mock).mock.calls.map(([sql]: [string]) => sql);
      expect(andWhereCalls.some((c: string) => c.includes('ILIKE'))).toBe(true);
    });

    it('caps limit at 100', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '0' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      await service.getTextResponses(ctx, 'survey-1', 'q_text', { limit: 999 });

      expect(baseQb.limit).toHaveBeenCalledWith(100);
    });

    it('resolves questionTitle from schema', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '0' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getTextResponses(ctx, 'survey-1', 'q_text', {});

      expect(result.questionTitle).toBe('Open text');
    });

    it('falls back to questionId as title when question not in schema', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '0' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getTextResponses(ctx, 'survey-1', 'unknown_q', {});

      expect(result.questionTitle).toBe('unknown_q');
    });

    it('computes hasMore correctly', async () => {
      (baseQb.getRawOne as jest.Mock).mockResolvedValue({ total: '50' });
      (baseQb.getRawMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getTextResponses(ctx, 'survey-1', 'q_text', { page: 1, limit: 20 });

      expect(result.totalPages).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });
});
