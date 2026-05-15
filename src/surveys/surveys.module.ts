import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from './entities/survey.entity';
import { SurveyVersion } from './entities/survey-version.entity';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { SurveyVersionsController } from './survey-versions.controller';
import { SurveyVersionsService } from './survey-versions.service';
import { SchemaModule } from '../schema/schema.module';

@Module({
  imports: [TypeOrmModule.forFeature([Survey, SurveyVersion]), SchemaModule],
  controllers: [SurveysController, SurveyVersionsController],
  providers: [SurveysService, SurveyVersionsService],
  exports: [SurveysService, SurveyVersionsService],
})
export class SurveysModule {}
