import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Response } from '../responses/entities/response.entity';
import { SurveyVersion } from '../surveys/entities/survey-version.entity';
import { ResponseStatus } from '../common/constants/status.constants';
import { RequestContext } from '../common/interfaces/request-context.interface';
import { AggregationService } from './aggregation.service';
import {
  AnalyticsQueryDto,
  QuestionAnalyticsDto,
  ChoiceDistributionDto,
  WordFrequencyDto,
  VersionMode,
  TextResponsesQueryDto,
  PaginatedTextResponsesDto,
  TextResponseItemDto,
} from './dto';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
  'once', 'if', 'unless', 'until', 'while', 'about', 'after', 'before',
  'above', 'below', 'between', 'into', 'through', 'during', 'out', 'off',
  'over', 'under', 'again', 'further', 'am', 'being', 'my', 'your', 'his',
  'her', 'our', 'their', 'me', 'him', 'us', 'them', 'myself', 'yourself',
]);

interface MergedChoice {
  questionId: string;
  value: string;
  label: string;
  versions: number[];
  isInLatestVersion: boolean;
}

interface ExtractedQuestion {
  id: string;
  type: string;
  title: string;
  choices?: Array<{ value: string; text?: string }>;
  versionNumber?: number;
}

@Injectable()
export class QuestionAnalyticsService {
  constructor(
    @InjectRepository(Response)
    private readonly responseRepository: Repository<Response>,
    @InjectRepository(SurveyVersion)
    private readonly versionRepository: Repository<SurveyVersion>,
    private readonly aggregationService: AggregationService,
  ) {}

  async getRelevantVersions(surveyId: string, query: AnalyticsQueryDto): Promise<SurveyVersion[]> {
    if (query.versionMode === VersionMode.SPECIFIC && query.versionId) {
      const version = await this.versionRepository.findOne({ where: { id: query.versionId, surveyId } });
      return version ? [version] : [];
    }
    return this.versionRepository.find({ where: { surveyId }, order: { versionNumber: 'ASC' } });
  }

  async calculateQuestionAnalyticsDB(
    ctx: RequestContext,
    surveyId: string,
    query: AnalyticsQueryDto,
    versions: SurveyVersion[],
  ): Promise<QuestionAnalyticsDto[]> {
    if (versions.length === 0) return [];

    const mergedQuestions = this.mergeQuestionsAcrossVersions(versions);
    const mergedChoices = this.mergeChoicesAcrossVersions(versions);
    const latestVersion = versions.reduce((a, b) => a.versionNumber > b.versionNumber ? a : b);
    const baseQuery = this.aggregationService.buildBaseQuery(ctx, surveyId, query);

    const totalResult = await baseQuery
      .clone()
      .select('COUNT(*)::int as total')
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .getRawOne();
    const totalCompleted = parseInt(totalResult?.total, 10) || 0;

    const questionAnalytics: QuestionAnalyticsDto[] = [];
    for (const [questionId, questionInfo] of mergedQuestions) {
      questionAnalytics.push(
        await this.analyzeQuestionDB(
          baseQuery.clone(), questionId, questionInfo,
          totalCompleted, mergedChoices, latestVersion.versionNumber,
        ),
      );
    }
    return questionAnalytics;
  }

  async getTextResponses(
    ctx: RequestContext,
    surveyId: string,
    questionId: string,
    query: TextResponsesQueryDto,
  ): Promise<PaginatedTextResponsesDto> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    const versions = await this.getRelevantVersions(surveyId, query);
    const mergedQuestions = this.mergeQuestionsAcrossVersions(versions);
    const questionTitle = mergedQuestions.get(questionId)?.title || questionId;

    const baseQuery = this.aggregationService.buildBaseQuery(ctx, surveyId, query);

    let textQuery = baseQuery
      .clone()
      .select([
        'r.id as "responseId"',
        `"r"."answersJson"->>:questionId as text`,
        'r.completedAt as "submittedAt"',
        'r.respondentId as "respondentId"',
      ])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .andWhere(`"r"."answersJson"->>:questionId IS NOT NULL`)
      .andWhere(`"r"."answersJson"->>:questionId != ''`)
      .setParameters({ questionId });

    if (query.search) {
      textQuery = textQuery.andWhere(
        `"r"."answersJson"->>:questionId ILIKE :search`,
        { search: `%${query.search}%` },
      );
    }

    const countResult = await textQuery
      .clone()
      .select('COUNT(*)::int as total')
      .getRawOne()
      .catch(() => ({ total: 0 }));

    const total = parseInt(countResult?.total, 10) || 0;

    const results = await textQuery
      .orderBy('r.completedAt', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany()
      .catch(() => []);

    const items: TextResponseItemDto[] = results.map((row) => ({
      responseId: row.responseId,
      text: row.text,
      submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : '',
      respondentId: row.respondentId || undefined,
    }));

    const totalPages = Math.ceil(total / limit);

    return { questionId, questionTitle, items, total, page, limit, totalPages, hasMore: page < totalPages };
  }

  private async analyzeQuestionDB(
    baseQuery: SelectQueryBuilder<Response>,
    questionId: string,
    questionInfo: ExtractedQuestion,
    totalCompleted: number,
    mergedChoices: Map<string, MergedChoice>,
    latestVersionNumber: number,
  ): Promise<QuestionAnalyticsDto> {
    const countResult = await baseQuery
      .clone()
      .select([
        `COUNT(*) FILTER (WHERE "r"."answersJson" ? :questionId AND "r"."answersJson"->>:questionId != '' AND "r"."answersJson"->>:questionId IS NOT NULL)::int as answered`,
      ])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .setParameters({ questionId })
      .getRawOne();

    const totalAnswers = parseInt(countResult?.answered, 10) || 0;
    const skipped = totalCompleted - totalAnswers;
    const isLegacy = questionInfo.versionNumber !== undefined &&
                     questionInfo.versionNumber !== latestVersionNumber;

    const base: QuestionAnalyticsDto = {
      questionId, questionType: questionInfo.type, questionTitle: questionInfo.title,
      totalAnswers, skipped, isLegacy,
      fromVersions: questionInfo.versionNumber ? [questionInfo.versionNumber] : undefined,
    };

    switch (questionInfo.type) {
      case 'radiogroup':
      case 'dropdown':
      case 'single_choice':
        return this.analyzeChoiceQuestionDB(baseQuery, questionId, base, mergedChoices, latestVersionNumber, false);
      case 'checkbox':
      case 'multiple_choice':
        return this.analyzeChoiceQuestionDB(baseQuery, questionId, base, mergedChoices, latestVersionNumber, true);
      case 'rating':
        return this.analyzeRatingQuestionDB(baseQuery, questionId, base);
      case 'boolean':
        return this.analyzeBooleanQuestionDB(baseQuery, questionId, base);
      case 'text':
      case 'comment':
      case 'textarea':
        return this.analyzeTextQuestionDB(baseQuery, questionId, base);
      default:
        return base;
    }
  }

  private async analyzeChoiceQuestionDB(
    baseQuery: SelectQueryBuilder<Response>,
    questionId: string,
    base: QuestionAnalyticsDto,
    mergedChoices: Map<string, MergedChoice>,
    latestVersionNumber: number,
    isMultiple: boolean,
  ): Promise<QuestionAnalyticsDto> {
    const answersResult = await baseQuery
      .clone()
      .select([`"r"."answersJson"->'${questionId}' as answer`])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :qid`, { qid: questionId })
      .getRawMany()
      .catch(() => []);

    const counts = new Map<string, number>();
    for (const row of answersResult) {
      if (row.answer === null || row.answer === undefined) continue;
      if (isMultiple && Array.isArray(row.answer)) {
        for (const val of row.answer) counts.set(String(val), (counts.get(String(val)) || 0) + 1);
      } else if (typeof row.answer === 'string' || typeof row.answer === 'number') {
        const key = String(row.answer);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const results = Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
    const total = results.reduce((sum, r) => sum + r.count, 0);
    const distribution: ChoiceDistributionDto[] = [];
    const seenValues = new Set<string>();

    for (const row of results) {
      const value = String(row.value);
      seenValues.add(value);
      const choiceKey = `${questionId}:${value}`;
      const mergedChoice = mergedChoices.get(choiceKey);
      distribution.push({
        value, label: mergedChoice?.label || value, count: row.count,
        percentage: total > 0 ? Math.round((row.count / total) * 100 * 10) / 10 : 0,
        isLegacy: mergedChoice ? !mergedChoice.isInLatestVersion : true,
        fromVersions: mergedChoice?.versions,
      });
    }

    for (const [, mergedChoice] of mergedChoices) {
      if (mergedChoice.questionId === questionId && !seenValues.has(mergedChoice.value)) {
        distribution.push({
          value: mergedChoice.value, label: mergedChoice.label, count: 0, percentage: 0,
          isLegacy: !mergedChoice.isInLatestVersion, fromVersions: mergedChoice.versions,
        });
      }
    }

    return { ...base, distribution: distribution.sort((a, b) => b.count - a.count) };
  }

  private async analyzeRatingQuestionDB(
    baseQuery: SelectQueryBuilder<Response>,
    questionId: string,
    base: QuestionAnalyticsDto,
  ): Promise<QuestionAnalyticsDto> {
    const statsResult = await baseQuery
      .clone()
      .select([
        `AVG(("r"."answersJson"->>:questionId)::numeric) as avg`,
        `MIN(("r"."answersJson"->>:questionId)::numeric) as min`,
        `MAX(("r"."answersJson"->>:questionId)::numeric) as max`,
        `STDDEV(("r"."answersJson"->>:questionId)::numeric) as stddev`,
      ])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .andWhere(`"r"."answersJson"->>:questionId ~ '^[0-9]+(\\.[0-9]+)?$'`)
      .setParameters({ questionId })
      .getRawOne()
      .catch(() => ({}));

    const distributionResult = await baseQuery
      .clone()
      .select([`"r"."answersJson"->>:questionId as value`, 'COUNT(*)::int as count'])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .andWhere(`"r"."answersJson"->>:questionId ~ '^[0-9]+(\\.[0-9]+)?$'`)
      .groupBy(`"r"."answersJson"->>:questionId`)
      .orderBy(`"r"."answersJson"->>:questionId`, 'ASC')
      .setParameters({ questionId })
      .getRawMany()
      .catch(() => []);

    const valueDistribution: Record<string, number> = {};
    for (const row of distributionResult) valueDistribution[row.value] = parseInt(row.count, 10);

    const values = distributionResult.flatMap((row) =>
      Array(parseInt(row.count, 10)).fill(parseFloat(row.value)),
    );
    const median = this.aggregationService.calculateMedian(values);

    return {
      ...base,
      average: statsResult?.avg ? Math.round(parseFloat(statsResult.avg) * 100) / 100 : undefined,
      median: Math.round(median * 100) / 100,
      stdDeviation: statsResult?.stddev ? Math.round(parseFloat(statsResult.stddev) * 100) / 100 : undefined,
      min: statsResult?.min ? parseFloat(statsResult.min) : undefined,
      max: statsResult?.max ? parseFloat(statsResult.max) : undefined,
      valueDistribution,
    };
  }

  private async analyzeBooleanQuestionDB(
    baseQuery: SelectQueryBuilder<Response>,
    questionId: string,
    base: QuestionAnalyticsDto,
  ): Promise<QuestionAnalyticsDto> {
    const result = await baseQuery
      .clone()
      .select([
        `COUNT(*) FILTER (WHERE "r"."answersJson"->>:questionId IN ('true', '1'))::int as true_count`,
        `COUNT(*) FILTER (WHERE "r"."answersJson"->>:questionId IN ('false', '0'))::int as false_count`,
      ])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .setParameters({ questionId })
      .getRawOne()
      .catch(() => ({ true_count: 0, false_count: 0 }));

    const trueCount = parseInt(result?.true_count, 10) || 0;
    const falseCount = parseInt(result?.false_count, 10) || 0;
    const total = trueCount + falseCount;

    return {
      ...base, trueCount, falseCount,
      distribution: [
        { value: 'true', label: 'Yes', count: trueCount, percentage: total > 0 ? Math.round((trueCount / total) * 100 * 10) / 10 : 0 },
        { value: 'false', label: 'No', count: falseCount, percentage: total > 0 ? Math.round((falseCount / total) * 100 * 10) / 10 : 0 },
      ],
    };
  }

  private async analyzeTextQuestionDB(
    baseQuery: SelectQueryBuilder<Response>,
    questionId: string,
    base: QuestionAnalyticsDto,
  ): Promise<QuestionAnalyticsDto> {
    const statsResult = await baseQuery
      .clone()
      .select([
        `AVG(LENGTH("r"."answersJson"->>:questionId))::int as avg_length`,
        `COUNT(*)::int as total_text_responses`,
      ])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .andWhere(`"r"."answersJson"->>:questionId IS NOT NULL`)
      .andWhere(`"r"."answersJson"->>:questionId != ''`)
      .setParameters({ questionId })
      .getRawOne()
      .catch(() => ({ avg_length: 0, total_text_responses: 0 }));

    const totalTextResponses = parseInt(statsResult?.total_text_responses, 10) || 0;

    const textAnswers = await baseQuery
      .clone()
      .select([`"r"."answersJson"->>:questionId as text`])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .andWhere(`"r"."answersJson"->>:questionId IS NOT NULL`)
      .andWhere(`"r"."answersJson"->>:questionId != ''`)
      .orderBy('RANDOM()')
      .limit(500)
      .setParameters({ questionId })
      .getRawMany()
      .catch(() => []);

    const recentAnswers = await baseQuery
      .clone()
      .select([`"r"."answersJson"->>:questionId as text`])
      .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
      .andWhere(`"r"."answersJson" ? :questionId`)
      .andWhere(`"r"."answersJson"->>:questionId IS NOT NULL`)
      .andWhere(`"r"."answersJson"->>:questionId != ''`)
      .orderBy('r.completedAt', 'DESC')
      .limit(10)
      .setParameters({ questionId })
      .getRawMany()
      .catch(() => []);

    const wordCounts = new Map<string, number>();
    for (const row of textAnswers) {
      if (row.text) {
        const words = String(row.text)
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
        for (const word of words) wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    const wordFrequency: WordFrequencyDto[] = Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const recentResponses = recentAnswers
      .map((row) => { const t = String(row.text || ''); return t.length > 200 ? t.substring(0, 200) + '...' : t; })
      .filter((t) => t.length > 0);

    return {
      ...base,
      avgTextLength: parseInt(statsResult?.avg_length, 10) || 0,
      wordFrequency,
      sampleSize: Math.min(textAnswers.length, totalTextResponses),
      recentResponses,
    };
  }

  private mergeQuestionsAcrossVersions(versions: SurveyVersion[]): Map<string, ExtractedQuestion> {
    const merged = new Map<string, ExtractedQuestion>();
    const latestVersionNumber = Math.max(...versions.map((v) => v.versionNumber));

    for (const version of versions) {
      for (const q of this.extractQuestionsFromSchema(version.schemaJson)) {
        if (!merged.has(q.id) || version.versionNumber === latestVersionNumber) {
          merged.set(q.id, { ...q, versionNumber: version.versionNumber });
        }
      }
    }
    return merged;
  }

  private mergeChoicesAcrossVersions(versions: SurveyVersion[]): Map<string, MergedChoice> {
    const merged = new Map<string, MergedChoice>();
    const latestVersionNumber = Math.max(...versions.map((v) => v.versionNumber));

    for (const version of versions) {
      for (const q of this.extractQuestionsFromSchema(version.schemaJson)) {
        if (!q.choices) continue;
        for (const choice of q.choices) {
          const value = typeof choice === 'object' ? String(choice.value) : String(choice);
          const label = typeof choice === 'object' ? (choice.text || value) : value;
          const key = `${q.id}:${value}`;

          if (!merged.has(key)) {
            merged.set(key, {
              questionId: q.id, value, label,
              versions: [version.versionNumber],
              isInLatestVersion: version.versionNumber === latestVersionNumber,
            });
          } else {
            const existing = merged.get(key)!;
            if (!existing.versions.includes(version.versionNumber)) existing.versions.push(version.versionNumber);
            if (version.versionNumber === latestVersionNumber) {
              existing.isInLatestVersion = true;
              existing.label = label;
            }
          }
        }
      }
    }
    return merged;
  }

  private extractQuestionsFromSchema(schema: Record<string, unknown>): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = [];
    for (const page of ((schema.pages as unknown[]) || [])) {
      const pageObj = page as Record<string, unknown>;
      for (const element of (((pageObj.questions || pageObj.elements) as unknown[]) || [])) {
        const q = element as Record<string, unknown>;
        const id = (q.id || q.name) as string;
        const type = q.type as string;
        const title = (q.title || q.name) as string;
        const choices = q.choices as Array<{ value: string; text?: string }> | undefined;
        if (id && type) questions.push({ id, type, title, choices });
      }
    }
    return questions;
  }
}
