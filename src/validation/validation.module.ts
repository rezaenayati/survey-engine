import { Module, Global } from '@nestjs/common';
import { SchemaValidatorService } from './services/schema-validator.service';
import { ResponseValidatorService } from './services/response-validator.service';
import { LogicEngineService } from './services/logic-engine.service';

@Global()
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
export class ValidationModule {}
