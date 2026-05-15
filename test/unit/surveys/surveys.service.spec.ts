import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SurveysService } from '../../../src/surveys/surveys.service';
import { Survey } from '../../../src/surveys/entities/survey.entity';
import { SurveyVersion } from '../../../src/surveys/entities/survey-version.entity';
import { SchemaValidatorService } from '../../../src/validation/services/schema-validator.service';
import { LogicEngineService } from '../../../src/validation/services/logic-engine.service';
import { SurveyStatus } from '../../../src/common/constants/status.constants';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const validSchema = {
  pages: [{ name: 'p1', elements: [{ name: 'q1', type: 'text', title: 'Q1' }] }],
};

function mockRepo<T>(overrides: Partial<Record<string, jest.Mock>> = {}): jest.Mocked<{
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
    save: jest.fn(async (entity) => ({ id: 'survey-1', ...entity })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(async () => undefined),
    update: jest.fn(async () => ({ affected: 1 })),
    ...overrides,
  } as never;
}

describe('SurveysService', () => {
  let service: SurveysService;
  let surveyRepo: ReturnType<typeof mockRepo>;
  let versionRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    surveyRepo = mockRepo();
    versionRepo = mockRepo();

    const module = await Test.createTestingModule({
      providers: [
        SurveysService,
        SchemaValidatorService,
        LogicEngineService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyVersion), useValue: versionRepo },
      ],
    }).compile();

    service = module.get(SurveysService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a draft survey with valid schema', async () => {
      surveyRepo.save.mockResolvedValue({ id: 'survey-1', name: 'Test', status: SurveyStatus.DRAFT, createdBy: 'user-1' });

      const survey = await service.create(ctx, { name: 'Test', schemaJson: validSchema });
      expect(survey.status).toBe(SurveyStatus.DRAFT);
      expect(surveyRepo.save).toHaveBeenCalled();
    });

    it('sets createdBy from ctx.userId', async () => {
      surveyRepo.save.mockResolvedValue({ id: 's1', createdBy: 'user-1' });
      await service.create(ctx, { name: 'Test' });
      expect(surveyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'user-1' }));
    });

    it('throws BadRequestException when schema is invalid', async () => {
      await expect(
        service.create(ctx, { name: 'Test', schemaJson: {} as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(surveyRepo.save).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns survey when found', async () => {
      const survey = { id: 'survey-1', name: 'Test', status: SurveyStatus.DRAFT };
      surveyRepo.findOne.mockResolvedValue(survey);

      const result = await service.findOne(ctx, 'survey-1');
      expect(result).toBe(survey);
    });

    it('throws NotFoundException when survey does not exist', async () => {
      surveyRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(ctx, 'bad-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates name and description', async () => {
      const existing = { id: 's1', name: 'Old', status: SurveyStatus.DRAFT, draftSchemaJson: null, draftLogicJson: null, settings: {} };
      surveyRepo.findOne.mockResolvedValue(existing);
      surveyRepo.save.mockResolvedValue({ ...existing, name: 'New' });

      const result = await service.update(ctx, 's1', { name: 'New' });
      expect(result.name).toBe('New');
    });

    it('throws BadRequestException when updating an archived survey', async () => {
      surveyRepo.findOne.mockResolvedValue({ id: 's1', status: SurveyStatus.ARCHIVED });
      await expect(service.update(ctx, 's1', { name: 'New' })).rejects.toBeInstanceOf(BadRequestException);
    });
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
      // First findOne call (in publish) returns draft; second (final return) returns published
      surveyRepo.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, status: SurveyStatus.PUBLISHED, activeVersionId: 'v1' });

      versionRepo.findOne.mockResolvedValue(null); // no previous versions
      versionRepo.save.mockResolvedValue({ id: 'v1', versionNumber: 1 });

      const result = await service.publish(ctx, 's1');
      expect(result.status).toBe(SurveyStatus.PUBLISHED);
      expect(versionRepo.save).toHaveBeenCalled();
      expect(surveyRepo.update).toHaveBeenCalledWith('s1', expect.objectContaining({ status: SurveyStatus.PUBLISHED }));
    });

    it('throws BadRequestException when survey has no schema', async () => {
      surveyRepo.findOne.mockResolvedValue({ id: 's1', status: SurveyStatus.DRAFT, draftSchemaJson: null });
      await expect(service.publish(ctx, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when publishing an archived survey', async () => {
      surveyRepo.findOne.mockResolvedValue({ id: 's1', status: SurveyStatus.ARCHIVED });
      await expect(service.publish(ctx, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments versionNumber when previous version exists', async () => {
      const existing = { id: 's1', status: SurveyStatus.DRAFT, draftSchemaJson: validSchema, draftLogicJson: null };
      surveyRepo.findOne.mockResolvedValue(existing);
      versionRepo.findOne.mockResolvedValue({ versionNumber: 3 });
      versionRepo.save.mockResolvedValue({ id: 'v4', versionNumber: 4 });

      await service.publish(ctx, 's1');
      expect(versionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 4 }));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getRuntime
  // ──────────────────────────────────────────────────────────────────────────

  describe('getRuntime', () => {
    it('returns active version for a published survey', async () => {
      surveyRepo.findOne.mockResolvedValue({ id: 's1', status: SurveyStatus.PUBLISHED, activeVersionId: 'v1' });
      const version = { id: 'v1', schemaJson: validSchema };
      versionRepo.findOne.mockResolvedValue(version);

      const result = await service.getRuntime(ctx, 's1');
      expect(result).toBe(version);
    });

    it('throws BadRequestException when survey has no published version', async () => {
      surveyRepo.findOne.mockResolvedValue({ id: 's1', activeVersionId: null });
      await expect(service.getRuntime(ctx, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
