import { Module } from '@nestjs/common';
import { SchemaValidatorService } from './services/schema-validator.service';
import { ResponseValidatorService } from './services/response-validator.service';
import { LogicEngineService } from './services/logic-engine.service';

@Module({
  providers: [
    SchemaValidatorService,
    ResponseValidatorService,
    LogicEngineService,
  ],
  exports: [
    SchemaValidatorService,
    ResponseValidatorService,
    LogicEngineService,
  ],
})
export class SchemaModule {}
