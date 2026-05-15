import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from './entities/response.entity';
import { SurveyVersion } from '../surveys/entities/survey-version.entity';
import { ResponsesController } from './responses.controller';
import { ResponsesService } from './responses.service';
import { SurveysModule } from '../surveys/surveys.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SchemaModule } from '../schema/schema.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Response, SurveyVersion]),
    SurveysModule,
    WebhooksModule,
    SchemaModule,
  ],
  controllers: [ResponsesController],
  providers: [ResponsesService],
  exports: [ResponsesService],
})
export class ResponsesModule {}
