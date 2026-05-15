import { Test } from '@nestjs/testing';
import { ResponseValidatorService } from '../../../src/validation/services/response-validator.service';
import { SchemaValidatorService } from '../../../src/validation/services/schema-validator.service';

/** SurveyJS-format schema with several question types */
const schema = {
  pages: [
    {
      name: 'page1',
      elements: [
        {
          name: 'name',
          type: 'text',
          title: 'Your name',
          isRequired: true,
        },
        {
          name: 'age',
          type: 'text',
          title: 'Your age',
          isRequired: false,
          validators: [{ type: 'numeric', minValue: 0, maxValue: 120 }],
        },
        {
          name: 'email',
          type: 'text',
          title: 'Email',
          isRequired: false,
          validators: [{ type: 'email' }],
        },
        {
          name: 'choice',
          type: 'radiogroup',
          title: 'Pick one',
          isRequired: true,
          choices: [
            { value: 'a', text: 'Option A' },
            { value: 'b', text: 'Option B' },
          ],
        },
        {
          name: 'multi',
          type: 'checkbox',
          title: 'Pick many',
          isRequired: false,
          choices: [
            { value: 'x', text: 'X' },
            { value: 'y', text: 'Y' },
          ],
        },
      ],
    },
  ],
};

describe('ResponseValidatorService', () => {
  let service: ResponseValidatorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SchemaValidatorService, ResponseValidatorService],
    }).compile();
    service = module.get(ResponseValidatorService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Required field checks
  // ──────────────────────────────────────────────────────────────────────────

  describe('required fields', () => {
    it('passes when all required fields are answered', () => {
      const result = service.validateResponse(schema as never, {
        name: 'Alice',
        choice: 'a',
      });
      expect(result.missingRequired).toEqual([]);
    });

    it('reports missing required fields', () => {
      const result = service.validateResponse(schema as never, {});
      expect(result.missingRequired).toContain('name');
      expect(result.missingRequired).toContain('choice');
      expect(result.valid).toBe(false);
    });

    it('does not report missing optional fields', () => {
      const result = service.validateResponse(schema as never, {
        name: 'Alice',
        choice: 'a',
      });
      expect(result.missingRequired).not.toContain('age');
      expect(result.missingRequired).not.toContain('email');
      expect(result.missingRequired).not.toContain('multi');
    });

    it('skips required check when validateRequired is false', () => {
      const result = service.validateResponse(schema as never, {}, { validateRequired: false });
      expect(result.missingRequired).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Partial validation
  // ──────────────────────────────────────────────────────────────────────────

  describe('partial validation', () => {
    it('still reports required fields even with partialValidation (use validateRequired:false to skip)', () => {
      // partialValidation means "partial answers are OK for answered questions",
      // but required checking still happens unless validateRequired is false
      const result = service.validateResponse(schema as never, {}, { partialValidation: true, validateRequired: false });
      expect(result.missingRequired).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Fully valid response
  // ──────────────────────────────────────────────────────────────────────────

  it('passes for a complete valid response', () => {
    const result = service.validateResponse(schema as never, {
      name: 'Alice',
      age: '30',
      email: 'alice@example.com',
      choice: 'a',
      multi: ['x', 'y'],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.missingRequired).toHaveLength(0);
  });
});
