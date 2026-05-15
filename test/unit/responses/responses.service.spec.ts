import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResponsesService } from '../../../src/responses/responses.service';
import { Response } from '../../../src/responses/entities/response.entity';
import { SurveyVersion } from '../../../src/surveys/entities/survey-version.entity';
import { SurveysService } from '../../../src/surveys/surveys.service';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';
import { LogicEngineService } from '../../../src/schema/services/logic-engine.service';
import { ResponseValidatorService } from '../../../src/schema/services/response-validator.service';
import { WebhookService } from '../../../src/webhooks/webhook.service';
import { ResponseStatus } from '../../../src/common/constants/status.constants';
import type { RequestContext } from '../../../src/common/interfaces/request-context.interface';

const ctx: RequestContext = { userId: 'user-1', correlationId: 'corr-1' };

const validSchema = {
  pages: [
    {
      name: 'page1',
      elements: [{ name: 'q1', type: 'text', title: 'Q1', isRequired: false }],
    },
  ],
};

const activeVersion: Partial<SurveyVersion> = {
  id: 'version-1',
  schemaJson: validSchema,
  logicJson: null,
};

function makeResponseRepo(overrides = {}) {
  return {
    create: jest.fn((data) => data),
    save: jest.fn(async (e) => ({ id: 'resp-1', ...e })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    remove: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('ResponsesService', () => {
  let service: ResponsesService;
  let responseRepo: ReturnType<typeof makeResponseRepo>;
  let versionRepo: { findOne: jest.Mock };
  let surveysService: { getRuntime: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    responseRepo = makeResponseRepo();
    versionRepo = { findOne: jest.fn().mockResolvedValue(activeVersion) };
    surveysService = {
      getRuntime: jest.fn().mockResolvedValue(activeVersion),
      findOne: jest.fn().mockResolvedValue({
        id: 's1',
        settings: {},
        activeVersionId: 'version-1',
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ResponsesService,
        SchemaValidatorService,
        LogicEngineService,
        ResponseValidatorService,
        { provide: getRepositoryToken(Response), useValue: responseRepo },
        { provide: getRepositoryToken(SurveyVersion), useValue: versionRepo },
        { provide: SurveysService, useValue: surveysService },
        { provide: WebhookService, useValue: { fire: jest.fn() } },
      ],
    }).compile();

    service = module.get(ResponsesService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // start
  // ──────────────────────────────────────────────────────────────────────────

  describe('start', () => {
    it('creates a new response with STARTED status', async () => {
      responseRepo.save.mockResolvedValue({ id: 'r1', status: ResponseStatus.STARTED, surveyId: 's1' });

      const result = await service.start(ctx, { surveyId: 's1' });
      expect(result.status).toBe(ResponseStatus.STARTED);
      expect(responseRepo.save).toHaveBeenCalled();
    });

    it('sets respondentId from ctx.userId', async () => {
      responseRepo.save.mockResolvedValue({ id: 'r1' });
      await service.start(ctx, { surveyId: 's1' });
      expect(responseRepo.create).toHaveBeenCalledWith(expect.objectContaining({ respondentId: 'user-1' }));
    });

    it('sets respondentId to null for anonymous context', async () => {
      const anonCtx: RequestContext = { correlationId: 'corr-1' };
      responseRepo.save.mockResolvedValue({ id: 'r1' });
      await service.start(anonCtx, { surveyId: 's1' });
      expect(responseRepo.create).toHaveBeenCalledWith(expect.objectContaining({ respondentId: null }));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns response when found', async () => {
      const response = { id: 'r1', surveyId: 's1', status: ResponseStatus.STARTED };
      responseRepo.findOne.mockResolvedValue(response);
      expect(await service.findOne(ctx, 'r1')).toBe(response);
    });

    it('throws NotFoundException when not found', async () => {
      responseRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(ctx, 'bad-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('merges answers into existing response', async () => {
      const existing = {
        id: 'r1',
        status: ResponseStatus.STARTED,
        answersJson: { q1: 'old' },
        metadata: {},
      };
      responseRepo.findOne.mockResolvedValue(existing);
      responseRepo.save.mockResolvedValue({ ...existing, answersJson: { q1: 'new' }, status: ResponseStatus.IN_PROGRESS });

      const result = await service.update(ctx, 'r1', { answersJson: { q1: 'new' } });
      expect(result.status).toBe(ResponseStatus.IN_PROGRESS);
      expect(responseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ answersJson: { q1: 'new' } }));
    });

    it('throws BadRequestException when response is already completed', async () => {
      responseRepo.findOne.mockResolvedValue({ id: 'r1', status: ResponseStatus.COMPLETED, answersJson: {}, metadata: {} });
      await expect(service.update(ctx, 'r1', { answersJson: {} })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // complete
  // ──────────────────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('completes a valid in-progress response', async () => {
      const response = {
        id: 'r1',
        status: ResponseStatus.IN_PROGRESS,
        surveyVersionId: 'version-1',
        answersJson: {},
      };
      responseRepo.findOne.mockResolvedValue(response);
      responseRepo.save.mockResolvedValue({ ...response, status: ResponseStatus.COMPLETED, completedAt: new Date() });

      const result = await service.complete(ctx, 'r1');
      expect(result.status).toBe(ResponseStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('throws BadRequestException when response is already completed', async () => {
      responseRepo.findOne.mockResolvedValue({ id: 'r1', status: ResponseStatus.COMPLETED, surveyVersionId: 'v1', answersJson: {} });
      await expect(service.complete(ctx, 'r1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
