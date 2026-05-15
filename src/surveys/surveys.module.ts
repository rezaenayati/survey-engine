import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from './entities/survey.entity';
import { SurveyVersion } from './entities/survey-version.entity';
import { Response } from '../responses/entities/response.entity';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Survey, SurveyVersion, Response])],
  controllers: [SurveysController],
  providers: [SurveysService, AnalyticsService],
  exports: [SurveysService, AnalyticsService],
})
export class SurveysModule {}
