import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyVersion } from '../surveys/entities/survey-version.entity';
import { Response } from '../responses/entities/response.entity';
import { SurveysModule } from '../surveys/surveys.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AggregationService } from './aggregation.service';
import { QuestionAnalyticsService } from './question-analytics.service';
import { ExportService } from './export.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([SurveyVersion, Response]),
        SurveysModule,
    ],
    controllers: [AnalyticsController],
    providers: [
        AnalyticsService,
        AggregationService,
        QuestionAnalyticsService,
        ExportService,
    ],
})
export class AnalyticsModule {}
