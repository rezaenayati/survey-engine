import { Injectable } from '@nestjs/common';
import { SurveyAnalyticsDto } from './dto';

@Injectable()
export class ExportService {
  convertToCSV(analytics: SurveyAnalyticsDto): string {
    const lines: string[] = [
      'SURVEY ANALYTICS REPORT',
      `Survey: ${analytics.surveyName}`,
      `Generated: ${analytics.generatedAt}`,
      '',
    ];

    if (analytics.appliedFilters) {
      lines.push('APPLIED FILTERS');
      if (analytics.appliedFilters.dateRange) {
        lines.push(
          `Date Range: ${analytics.appliedFilters.dateRange.startDate || 'any'} to ${analytics.appliedFilters.dateRange.endDate || 'any'}`,
        );
      }
      lines.push(
        `Version Mode: ${analytics.appliedFilters.versionMode || 'combined'}`,
      );
      if (analytics.appliedFilters.respondentIdsCount) {
        lines.push(
          `Respondent IDs: ${analytics.appliedFilters.respondentIdsCount} filtered`,
        );
      }
      lines.push('');
    }

    lines.push(
      'SUMMARY',
      `Total Responses,${analytics.summary.totalResponses}`,
      `Completed Responses,${analytics.summary.completedResponses}`,
      `Completion Rate,${analytics.summary.completionRate}%`,
      `Avg Completion Time (sec),${analytics.summary.avgCompletionTime}`,
      '',
      'COMPLETION FUNNEL',
      `Total,${analytics.funnel.total}`,
      `Started,${analytics.funnel.started}`,
      `In Progress,${analytics.funnel.inProgress}`,
      `Completed,${analytics.funnel.completed}`,
      `Abandoned,${analytics.funnel.abandoned}`,
      `Active (not finished),${analytics.funnel.activeResponses}`,
      `Stale (inactive),${analytics.funnel.staleResponses}`,
      '',
      'QUESTION ANALYTICS',
    );

    for (const q of analytics.questions) {
      lines.push(
        '',
        `Question: ${q.questionTitle}${q.isLegacy ? ' [LEGACY]' : ''}`,
        `Type: ${q.questionType}`,
        `Total Answers: ${q.totalAnswers}`,
        `Skipped: ${q.skipped}`,
      );
      if (q.distribution) {
        lines.push('Choice,Count,Percentage,Legacy');
        for (const d of q.distribution)
          lines.push(
            `"${d.label}",${d.count},${d.percentage}%,${d.isLegacy ? 'Yes' : 'No'}`,
          );
      }
      if (q.average !== undefined) {
        lines.push(
          `Average: ${q.average}`,
          `Median: ${q.median}`,
          `Std Deviation: ${q.stdDeviation}`,
        );
      }
      if (q.wordFrequency?.length) {
        lines.push('Word,Count');
        for (const w of q.wordFrequency) lines.push(`"${w.word}",${w.count}`);
      }
    }

    return lines.join('\n');
  }
}
