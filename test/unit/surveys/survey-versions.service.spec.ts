import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SurveyVersionsService } from '../../../src/surveys/survey-versions.service';
import { SurveysService } from '../../../src/surveys/surveys.service';
import { Survey } from '../../../src/surveys/entities/survey.entity';
import { SurveyVersion } from '../../../src/surveys/entities/survey-version.entity';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';
import { LogicEngineService } from '../../../src/schema/services/logic-engine.service';
import { SurveyStatus } from '../../../src/common/constants/status.constants';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const validSchema = {
  pages: [{ name: 'p1', elements: [{ name: 'q1', type: 'text', title: 'Q1' }] }],
};

function mockRepo(overrides: Partial<Record<string, jest.Mock>> = {}): jest.Mocked<{
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  findAndCount: jest.Mock;
  find: jest.Mock;
  remove: jest.Mock;
  update: jest.Mock;
}> {
  return {
    create: jest.fn((data) => data),
    save: jest.fn(async (entity) => ({ id: 'v1', ...entity })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(async () => undefined),
    update: jest.fn(async () => ({ affected: 1 })),
    ...overrides,
  } as never;
}

describe('SurveyVersionsService', () => {
  let service: SurveyVersionsService;
  let surveyRepo: ReturnType<typeof mockRepo>;
  let versionRepo: ReturnType<typeof mockRepo>;
  let surveysService: { findOne: jest.Mock };

  beforeEach(async () => {
    surveyRepo = mockRepo();
    versionRepo = mockRepo();
    surveysService = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SurveyVersionsService,
        SchemaValidatorService,
        LogicEngineService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyVersion), useValue: versionRepo },
        { provide: SurveysService, useValue: surveysService },
      ],
    }).compile();

    service = module.get(SurveyVersionsService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // publish
  // ──────────────────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('creates a version and updates survey status to PUBLISHED', async () => {
      const existing = {
        id: 's1',
        status: SurveyStatus.DRAFT,
        draftSchemaJson: validSchema,
        draftLogicJson: null,
      };
      surveysService.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, status: SurveyStatus.PUBLISHED, activeVersionId: 'v1' });

      versionRepo.findOne.mockResolvedValue(null);
      versionRepo.save.mockResolvedValue({ id: 'v1', versionNumber: 1 });

      const result = await service.publish(ctx, 's1');
      expect(result.status).toBe(SurveyStatus.PUBLISHED);
      expect(versionRepo.save).toHaveBeenCalled();
      expect(surveyRepo.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: SurveyStatus.PUBLISHED }),
      );
    });

    it('throws BadRequestException when survey has no schema', async () => {
      surveysService.findOne.mockResolvedValue({
        id: 's1',
        status: SurveyStatus.DRAFT,
        draftSchemaJson: null,
      });
      await expect(service.publish(ctx, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when publishing an archived survey', async () => {
      surveysService.findOne.mockResolvedValue({ id: 's1', status: SurveyStatus.ARCHIVED });
      await expect(service.publish(ctx, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments versionNumber when previous version exists', async () => {
      const existing = {
        id: 's1',
        status: SurveyStatus.DRAFT,
        draftSchemaJson: validSchema,
        draftLogicJson: null,
      };
      surveysService.findOne.mockResolvedValue(existing);
      versionRepo.findOne.mockResolvedValue({ versionNumber: 3 });
      versionRepo.save.mockResolvedValue({ id: 'v4', versionNumber: 4 });

      await service.publish(ctx, 's1');
      expect(versionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 4 }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getRuntime
  // ──────────────────────────────────────────────────────────────────────────

  describe('getRuntime', () => {
    it('returns active version for a published survey', async () => {
      surveyRepo.findOne.mockResolvedValue({
        id: 's1',
        status: SurveyStatus.PUBLISHED,
        activeVersionId: 'v1',
      });
      const version = { id: 'v1', schemaJson: validSchema };
      versionRepo.findOne.mockResolvedValue(version);

      const result = await service.getRuntime(ctx, 's1');
      expect(result).toBe(version);
    });

    it('throws BadRequestException when survey has no published version', async () => {
      surveyRepo.findOne.mockResolvedValue({ id: 's1', activeVersionId: null });
      await expect(service.getRuntime(ctx, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when survey does not exist', async () => {
      surveyRepo.findOne.mockResolvedValue(null);
      await expect(service.getRuntime(ctx, 's1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
