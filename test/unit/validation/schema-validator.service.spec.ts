import { Test } from '@nestjs/testing';
import { SchemaValidatorService } from '../../../src/validation/services/schema-validator.service';

/** Minimal valid SurveyJS schema */
const minimalSchema = {
  pages: [
    {
      name: 'page1',
      elements: [
        { name: 'q1', type: 'text', title: 'Name' },
      ],
    },
  ],
};

describe('SchemaValidatorService', () => {
  let service: SchemaValidatorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SchemaValidatorService],
    }).compile();
    service = module.get(SchemaValidatorService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateSchema
  // ──────────────────────────────────────────────────────────────────────────

  describe('validateSchema', () => {
    it('accepts a minimal SurveyJS schema', () => {
      const result = service.validateSchema(minimalSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts internal format (id + questions)', () => {
      const result = service.validateSchema({
        version: '1.0',
        pages: [
          {
            id: 'page1',
            questions: [
              { id: 'q1', type: 'text', title: 'Name' },
            ],
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects non-object schema', () => {
      expect(service.validateSchema(null).valid).toBe(false);
      expect(service.validateSchema('string').valid).toBe(false);
      expect(service.validateSchema(42).valid).toBe(false);
    });

    it('requires pages array', () => {
      const result = service.validateSchema({ title: 'No Pages' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_PAGES');
    });

    it('warns on empty pages array', () => {
      const result = service.validateSchema({ pages: [] });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'EMPTY_PAGES')).toBe(true);
    });

    it('errors on duplicate page IDs', () => {
      const result = service.validateSchema({
        pages: [
          { name: 'page1', elements: [{ name: 'q1', type: 'text' }] },
          { name: 'page1', elements: [{ name: 'q2', type: 'text' }] },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_PAGE_ID')).toBe(true);
    });

    it('errors on duplicate question IDs', () => {
      const result = service.validateSchema({
        pages: [
          {
            name: 'page1',
            elements: [
              { name: 'q1', type: 'text' },
              { name: 'q1', type: 'text' },
            ],
          },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_QUESTION_ID')).toBe(true);
    });

    it('errors when page has no id or name', () => {
      const result = service.validateSchema({
        pages: [{ elements: [{ name: 'q1', type: 'text' }] }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_PAGE_ID')).toBe(true);
    });

    it('errors when question has no id or name', () => {
      const result = service.validateSchema({
        pages: [{ name: 'p1', elements: [{ type: 'text' }] }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_QUESTION_ID')).toBe(true);
    });

    it('warns on unknown question type', () => {
      const result = service.validateSchema({
        pages: [{ name: 'p1', elements: [{ name: 'q1', type: 'foobar_unknown' }] }],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'UNKNOWN_QUESTION_TYPE')).toBe(true);
    });

    it('accepts all standard SurveyJS types', () => {
      const surveyJsTypes = ['radiogroup', 'checkbox', 'dropdown', 'text', 'comment', 'rating', 'boolean', 'matrix', 'ranking', 'file', 'signaturepad'];
      for (const type of surveyJsTypes) {
        const result = service.validateSchema({
          pages: [{ name: 'p1', elements: [{ name: 'q1', type }] }],
        });
        expect(result.warnings.some(w => w.code === 'UNKNOWN_QUESTION_TYPE')).toBe(false);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // extractQuestionIds
  // ──────────────────────────────────────────────────────────────────────────

  describe('extractQuestionIds', () => {
    it('extracts IDs from SurveyJS (name/elements) format', () => {
      const ids = service.extractQuestionIds(minimalSchema as never);
      expect(ids).toEqual(['q1']);
    });

    it('extracts IDs from internal (id/questions) format', () => {
      const ids = service.extractQuestionIds({
        pages: [
          { id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] },
          { id: 'p2', questions: [{ id: 'q3' }] },
        ],
      } as never);
      expect(ids).toEqual(['q1', 'q2', 'q3']);
    });

    it('returns empty array for schema with no pages', () => {
      expect(service.extractQuestionIds({ pages: [] } as never)).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // extractPageIds
  // ──────────────────────────────────────────────────────────────────────────

  describe('extractPageIds', () => {
    it('extracts page IDs using name or id', () => {
      const ids = service.extractPageIds({
        pages: [{ name: 'p1', elements: [] }, { id: 'p2', questions: [] }],
      } as never);
      expect(ids).toEqual(['p1', 'p2']);
    });
  });
});
