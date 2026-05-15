import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Brackets } from 'typeorm';
import { Response } from '../responses/entities/response.entity';
import { ResponseStatus } from '../common/constants/status.constants';
import { RequestContext } from '../common/interfaces/request-context.interface';
import {
    AnalyticsQueryDto,
    AnalyticsSummaryDto,
    AnalyticsFunnelDto,
    AnalyticsTrendsDto,
    TrendDataPointDto,
    VersionMode,
    FilterOperator,
    AnswerFilterDto,
    AppliedFiltersDto,
} from './dto';

// Raw query result shapes returned by TypeORM getRawOne / getRawMany
interface SummaryRaw {
    total: string;
    completed: string;
    avg_time: string | null;
}
interface MedianRaw {
    median_time: string | null;
}
interface StatusCountRaw {
    status: string;
    count: string;
}
interface PeriodCountRaw {
    today: string;
    this_week: string;
}
interface FunnelRaw {
    total: string;
    started: string;
    in_progress: string;
    completed: string;
    abandoned: string;
    stale: string;
}
interface TrendRaw {
    date: string;
    count: string;
    completed: string;
}

@Injectable()
export class AggregationService {
    constructor(
        @InjectRepository(Response)
        private readonly responseRepository: Repository<Response>,
    ) {}

    buildBaseQuery(
        ctx: RequestContext,
        surveyId: string,
        query: AnalyticsQueryDto,
    ): SelectQueryBuilder<Response> {
        const qb = this.responseRepository
            .createQueryBuilder('r')
            .where('r.surveyId = :surveyId', { surveyId });

        if (query.startDate)
            qb.andWhere('r.startedAt >= :startDate', {
                startDate: new Date(query.startDate),
            });
        if (query.endDate)
            qb.andWhere('r.startedAt <= :endDate', {
                endDate: new Date(query.endDate),
            });

        if (query.versionMode === VersionMode.SPECIFIC && query.versionId) {
            qb.andWhere('r.surveyVersionId = :versionId', {
                versionId: query.versionId,
            });
        }

        if (query.status)
            qb.andWhere('r.status = :status', { status: query.status });

        if (query.respondentIds?.length) {
            qb.andWhere('r.respondentId IN (:...respondentIds)', {
                respondentIds: query.respondentIds,
            });
        }

        if (query.answerFilters?.length)
            this.applyAnswerFilters(qb, query.answerFilters);

        return qb;
    }

    async calculateSummaryDB(
        qb: SelectQueryBuilder<Response>,
        versionsIncluded: number[],
    ): Promise<AnalyticsSummaryDto> {
        const result = await qb
            .select([
                'COUNT(*)::int as total',
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.COMPLETED}')::int as completed`,
                `AVG(EXTRACT(EPOCH FROM (r.completedAt - r.startedAt))) FILTER (WHERE r.status = '${ResponseStatus.COMPLETED}' AND r.completedAt IS NOT NULL) as avg_time`,
            ])
            .getRawOne<SummaryRaw>();

        const medianResult = await this.responseRepository
            .createQueryBuilder('r')
            .select(
                `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.completedAt - r.startedAt))) as median_time`,
            )
            .where(
                qb
                    .getQuery()
                    .replace(/SELECT.*FROM/, 'r.id IN (SELECT r.id FROM'),
            )
            .andWhere(`r.status = '${ResponseStatus.COMPLETED}'`)
            .andWhere('r.completedAt IS NOT NULL')
            .setParameters(qb.getParameters())
            .getRawOne<MedianRaw>()
            .catch((): MedianRaw => ({ median_time: null }));

        const statusCounts = await qb
            .clone()
            .select(['r.status as status', 'COUNT(*)::int as count'])
            .groupBy('r.status')
            .getRawMany<StatusCountRaw>();

        const responsesByStatus: Record<string, number> = {};
        for (const row of statusCounts)
            responsesByStatus[row.status] = parseInt(row.count, 10);

        const now = new Date();
        const todayStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);

        const periodCounts = await qb
            .clone()
            .select([
                `COUNT(*) FILTER (WHERE r.startedAt >= :todayStart)::int as today`,
                `COUNT(*) FILTER (WHERE r.startedAt >= :weekStart)::int as this_week`,
            ])
            .setParameters({ todayStart, weekStart })
            .getRawOne<PeriodCountRaw>();

        const total = parseInt(result.total, 10) || 0;
        const completed = parseInt(result.completed, 10) || 0;

        return {
            totalResponses: total,
            completedResponses: completed,
            completionRate:
                total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0,
            avgCompletionTime: Math.round(
                parseFloat(result.avg_time ?? '0') || 0,
            ),
            medianCompletionTime: Math.round(
                parseFloat(medianResult?.median_time ?? '0') || 0,
            ),
            responsesByStatus,
            responsesToday: parseInt(periodCounts?.today, 10) || 0,
            responsesThisWeek: parseInt(periodCounts?.this_week, 10) || 0,
            versionsIncluded,
        };
    }

    async calculateFunnelDB(
        qb: SelectQueryBuilder<Response>,
        staleDays: number,
    ): Promise<AnalyticsFunnelDto> {
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - staleDays);

        const result = await qb
            .select([
                'COUNT(*)::int as total',
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.STARTED}')::int as started`,
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.IN_PROGRESS}')::int as in_progress`,
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.COMPLETED}')::int as completed`,
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.ABANDONED}')::int as abandoned`,
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.IN_PROGRESS}' AND r.updatedAt < :staleDate)::int as stale`,
            ])
            .setParameters({ staleDate })
            .getRawOne<FunnelRaw>();

        const total = parseInt(result.total, 10) || 0;
        const started = parseInt(result.started, 10) || 0;
        const inProgress = parseInt(result.in_progress, 10) || 0;
        const completed = parseInt(result.completed, 10) || 0;
        const abandoned = parseInt(result.abandoned, 10) || 0;
        const staleResponses = parseInt(result.stale, 10) || 0;

        return {
            total,
            started,
            inProgress,
            completed,
            abandoned,
            activeResponses: started + inProgress,
            staleResponses,
            completionRate:
                total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0,
            dropOffRate:
                total > 0
                    ? Math.round(((total - completed) / total) * 100 * 10) / 10
                    : 0,
            abandonmentRate:
                total > 0 ? Math.round((abandoned / total) * 100 * 10) / 10 : 0,
        };
    }

    async calculateTrendsDB(
        qb: SelectQueryBuilder<Response>,
    ): Promise<AnalyticsTrendsDto> {
        const dailyResults = await qb
            .clone()
            .select([
                "TO_CHAR(r.startedAt, 'YYYY-MM-DD') as date",
                'COUNT(*)::int as count',
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.COMPLETED}')::int as completed`,
            ])
            .groupBy("TO_CHAR(r.startedAt, 'YYYY-MM-DD')")
            .orderBy('date', 'ASC')
            .getRawMany<TrendRaw>();

        const weeklyResults = await qb
            .clone()
            .select([
                "TO_CHAR(DATE_TRUNC('week', r.startedAt), 'YYYY-MM-DD') as date",
                'COUNT(*)::int as count',
                `COUNT(*) FILTER (WHERE r.status = '${ResponseStatus.COMPLETED}')::int as completed`,
            ])
            .groupBy("DATE_TRUNC('week', r.startedAt)")
            .orderBy('date', 'ASC')
            .getRawMany<TrendRaw>();

        const mapRow = (row: TrendRaw): TrendDataPointDto => ({
            date: row.date,
            count: parseInt(row.count, 10),
            completed: parseInt(row.completed, 10),
        });

        return {
            daily: dailyResults.map(mapRow),
            weekly: weeklyResults.map(mapRow),
        };
    }

    buildAppliedFilters(query: AnalyticsQueryDto): AppliedFiltersDto {
        return {
            dateRange:
                query.startDate || query.endDate
                    ? { startDate: query.startDate, endDate: query.endDate }
                    : undefined,
            versionMode: query.versionMode,
            versionId: query.versionId,
            respondentIdsCount: query.respondentIds?.length,
            answerFilters: query.answerFilters,
            status: query.status,
        };
    }

    private applyAnswerFilters(
        qb: SelectQueryBuilder<Response>,
        filters: AnswerFilterDto[],
    ): void {
        filters.forEach((filter, index) => {
            const paramKey = `answerFilter${index}`;
            const questionIdKey = `qid${index}`;

            switch (filter.operator) {
                case FilterOperator.EQUALS:
                    qb.andWhere(
                        `"r"."answersJson"->>:${questionIdKey} = :${paramKey}`,
                        {
                            [questionIdKey]: filter.questionId,
                            [paramKey]: String(filter.value),
                        },
                    );
                    break;
                case FilterOperator.NOT_EQUALS:
                    qb.andWhere(
                        new Brackets((sub) => {
                            sub.where(
                                `"r"."answersJson"->>:${questionIdKey} != :${paramKey}`,
                                {
                                    [questionIdKey]: filter.questionId,
                                    [paramKey]: String(filter.value),
                                },
                            ).orWhere(
                                `"r"."answersJson"->>:${questionIdKey} IS NULL`,
                                {
                                    [questionIdKey]: filter.questionId,
                                },
                            );
                        }),
                    );
                    break;
                case FilterOperator.CONTAINS:
                    qb.andWhere(
                        `"r"."answersJson"->>:${questionIdKey} ILIKE :${paramKey}`,
                        {
                            [questionIdKey]: filter.questionId,
                            [paramKey]: `%${String(filter.value)}%`,
                        },
                    );
                    break;
                case FilterOperator.IN:
                    if (Array.isArray(filter.value)) {
                        qb.andWhere(
                            `"r"."answersJson"->>:${questionIdKey} IN (:...${paramKey})`,
                            {
                                [questionIdKey]: filter.questionId,
                                [paramKey]: filter.value.map(String),
                            },
                        );
                    }
                    break;
                case FilterOperator.GT:
                    qb.andWhere(
                        `("r"."answersJson"->>:${questionIdKey})::numeric > :${paramKey}`,
                        {
                            [questionIdKey]: filter.questionId,
                            [paramKey]: Number(filter.value),
                        },
                    );
                    break;
                case FilterOperator.LT:
                    qb.andWhere(
                        `("r"."answersJson"->>:${questionIdKey})::numeric < :${paramKey}`,
                        {
                            [questionIdKey]: filter.questionId,
                            [paramKey]: Number(filter.value),
                        },
                    );
                    break;
                case FilterOperator.GTE:
                    qb.andWhere(
                        `("r"."answersJson"->>:${questionIdKey})::numeric >= :${paramKey}`,
                        {
                            [questionIdKey]: filter.questionId,
                            [paramKey]: Number(filter.value),
                        },
                    );
                    break;
                case FilterOperator.LTE:
                    qb.andWhere(
                        `("r"."answersJson"->>:${questionIdKey})::numeric <= :${paramKey}`,
                        {
                            [questionIdKey]: filter.questionId,
                            [paramKey]: Number(filter.value),
                        },
                    );
                    break;
            }
        });
    }

    calculateMedian(numbers: number[]): number {
        if (numbers.length === 0) return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
}
