import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from '../surveys/entities/survey.entity';
import { SurveyVersion } from '../surveys/entities/survey-version.entity';
import { Response } from '../responses/entities/response.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Survey, SurveyVersion, Response])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
