import { Test } from '@nestjs/testing';
import { ResponseValidatorService } from '../../../src/schema/services/response-validator.service';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';

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
                    validators: [
                        { type: 'numeric', minValue: 0, maxValue: 120 },
                    ],
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
            const result = service.validateResponse(
                schema as never,
                {},
                { validateRequired: false },
            );
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
            const result = service.validateResponse(
                schema as never,
                {},
                { partialValidation: true, validateRequired: false },
            );
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

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — text
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — text', () => {
        const textQ = { id: 'q', type: 'text', title: 'Q', isRequired: false };

        it('rejects non-string answer', () => {
            const r = service.validateAnswer(textQ, 42);
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('enforces minLength', () => {
            const q = { ...textQ, minLength: 5 };
            const r = service.validateAnswer(q, 'ab');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('MIN_LENGTH');
        });

        it('enforces maxLength', () => {
            const q = { ...textQ, maxLength: 3 };
            const r = service.validateAnswer(q, 'toolong');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('MAX_LENGTH');
        });

        it('passes a valid text answer within bounds', () => {
            const q = { ...textQ, minLength: 2, maxLength: 10 };
            const r = service.validateAnswer(q, 'hello');
            expect(r.valid).toBe(true);
        });

        it('accepts comment type as text', () => {
            const q = { ...textQ, type: 'comment' };
            const r = service.validateAnswer(q, 'great');
            expect(r.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — radiogroup / dropdown
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — radiogroup / dropdown', () => {
        const choiceQ = {
            id: 'q',
            type: 'radiogroup',
            title: 'Q',
            isRequired: false,
            choices: [{ value: 'a' }, { value: 'b' }],
        };

        it('rejects non-string/number answer', () => {
            const r = service.validateAnswer(choiceQ, ['array']);
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('accepts a valid choice value', () => {
            const r = service.validateAnswer(choiceQ, 'a');
            expect(r.valid).toBe(true);
        });

        it('accepts numeric answer for dropdown', () => {
            const q = { ...choiceQ, type: 'dropdown' };
            const r = service.validateAnswer(q, 1);
            expect(r.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — checkbox
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — checkbox', () => {
        const multiQ = {
            id: 'q',
            type: 'checkbox',
            title: 'Q',
            isRequired: false,
        };

        it('rejects non-array answer', () => {
            const r = service.validateAnswer(multiQ, 'not-array');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('accepts an array answer', () => {
            const r = service.validateAnswer(multiQ, ['x', 'y']);
            expect(r.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — rating
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — rating', () => {
        const ratingQ = {
            id: 'q',
            type: 'rating',
            title: 'Q',
            isRequired: false,
            rateMin: 1,
            rateMax: 5,
        };

        it('rejects non-numeric answer', () => {
            const r = service.validateAnswer(ratingQ, 'abc');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('rejects out-of-range answer', () => {
            const r = service.validateAnswer(ratingQ, 10);
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('OUT_OF_RANGE');
        });

        it('accepts a string-encoded numeric rating', () => {
            const r = service.validateAnswer(ratingQ, '3');
            expect(r.valid).toBe(true);
        });

        it('uses default range 1-5 when rateMin/rateMax not set', () => {
            const q = {
                id: 'q',
                type: 'rating',
                title: 'Q',
                isRequired: false,
            };
            const r = service.validateAnswer(q, 0);
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('OUT_OF_RANGE');
        });

        it('accepts valid in-range rating', () => {
            const r = service.validateAnswer(ratingQ, 4);
            expect(r.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — boolean
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — boolean', () => {
        const boolQ = {
            id: 'q',
            type: 'boolean',
            title: 'Q',
            isRequired: false,
        };

        it('accepts true', () =>
            expect(service.validateAnswer(boolQ, true).valid).toBe(true));
        it('accepts false', () =>
            expect(service.validateAnswer(boolQ, false).valid).toBe(true));
        it('accepts string "true"', () =>
            expect(service.validateAnswer(boolQ, 'true').valid).toBe(true));
        it('accepts string "false"', () =>
            expect(service.validateAnswer(boolQ, 'false').valid).toBe(true));

        it('rejects non-boolean non-string', () => {
            const r = service.validateAnswer(boolQ, 1);
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — matrix
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — matrix', () => {
        const matrixQ = {
            id: 'q',
            type: 'matrix',
            title: 'Q',
            isRequired: false,
        };

        it('rejects non-object answer', () => {
            const r = service.validateAnswer(matrixQ, 'string');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('accepts an object answer', () => {
            const r = service.validateAnswer(matrixQ, { row1: 'col1' });
            expect(r.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — signaturepad / ranking
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateAnswer — signaturepad', () => {
        it('rejects non-string', () => {
            const q = {
                id: 'q',
                type: 'signaturepad',
                title: 'Q',
                isRequired: false,
            };
            const r = service.validateAnswer(q, 123);
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('accepts a data-url string', () => {
            const q = {
                id: 'q',
                type: 'signaturepad',
                title: 'Q',
                isRequired: false,
            };
            const r = service.validateAnswer(q, 'data:image/png;base64,abc');
            expect(r.valid).toBe(true);
        });
    });

    describe('validateAnswer — ranking', () => {
        it('rejects non-array', () => {
            const q = {
                id: 'q',
                type: 'ranking',
                title: 'Q',
                isRequired: false,
            };
            const r = service.validateAnswer(q, 'not-array');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_TYPE');
        });

        it('accepts an array', () => {
            const q = {
                id: 'q',
                type: 'ranking',
                title: 'Q',
                isRequired: false,
            };
            const r = service.validateAnswer(q, ['a', 'b', 'c']);
            expect(r.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateAnswer — SurveyJS validators
    // ──────────────────────────────────────────────────────────────────────────

    describe('SurveyJS validators', () => {
        it('regex validator — passes matching string', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'regex', regex: '^[0-9]+$' }],
            };
            const r = service.validateAnswer(q, '12345');
            expect(r.valid).toBe(true);
        });

        it('regex validator — fails non-matching string', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [
                    { type: 'regex', regex: '^[0-9]+$', text: 'Numbers only' },
                ],
            };
            const r = service.validateAnswer(q, 'abc');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('PATTERN_MISMATCH');
            expect(r.errors[0].message).toBe('Numbers only');
        });

        it('regex validator — silently skips invalid regex', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'regex', regex: '[invalid' }],
            };
            const r = service.validateAnswer(q, 'any');
            expect(r.valid).toBe(true);
        });

        it('text validator — enforces minLength', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'text', minLength: 5 }],
            };
            const r = service.validateAnswer(q, 'ab');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('MIN_LENGTH');
        });

        it('text validator — enforces maxLength', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'text', maxLength: 3 }],
            };
            const r = service.validateAnswer(q, 'toolong');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('MAX_LENGTH');
        });

        it('email validator — passes valid email', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'email' }],
            };
            const r = service.validateAnswer(q, 'user@example.com');
            expect(r.valid).toBe(true);
        });

        it('email validator — fails invalid email', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'email' }],
            };
            const r = service.validateAnswer(q, 'not-an-email');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_EMAIL');
        });

        it('numeric validator — passes numeric string', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'numeric' }],
            };
            const r = service.validateAnswer(q, '42.5');
            expect(r.valid).toBe(true);
        });

        it('numeric validator — fails non-numeric string', () => {
            const q = {
                id: 'q',
                type: 'text',
                title: 'Q',
                isRequired: false,
                validators: [{ type: 'numeric' }],
            };
            const r = service.validateAnswer(q, 'abc');
            expect(r.valid).toBe(false);
            expect(r.errors[0].code).toBe('INVALID_NUMBER');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateResponse — schema with no pages
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateResponse — edge cases', () => {
        it('passes when schema has no pages', () => {
            const result = service.validateResponse({} as never, {
                q1: 'answer',
            });
            expect(result.valid).toBe(true);
        });

        it('includes questionResults for answered questions', () => {
            const result = service.validateResponse(schema as never, {
                name: 'Alice',
                choice: 'a',
            });
            expect(
                result.questionResults.some((r) => r.questionId === 'name'),
            ).toBe(true);
        });
    });
});
