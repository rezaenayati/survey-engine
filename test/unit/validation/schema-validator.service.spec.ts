import { Test } from '@nestjs/testing';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';

/** Minimal valid SurveyJS schema */
const minimalSchema = {
    pages: [
        {
            name: 'page1',
            elements: [{ name: 'q1', type: 'text', title: 'Name' }],
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
                        questions: [{ id: 'q1', type: 'text', title: 'Name' }],
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
            expect(result.warnings.some((w) => w.code === 'EMPTY_PAGES')).toBe(
                true,
            );
        });

        it('errors on duplicate page IDs', () => {
            const result = service.validateSchema({
                pages: [
                    { name: 'page1', elements: [{ name: 'q1', type: 'text' }] },
                    { name: 'page1', elements: [{ name: 'q2', type: 'text' }] },
                ],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'DUPLICATE_PAGE_ID'),
            ).toBe(true);
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
            expect(
                result.errors.some((e) => e.code === 'DUPLICATE_QUESTION_ID'),
            ).toBe(true);
        });

        it('errors when page has no id or name', () => {
            const result = service.validateSchema({
                pages: [{ elements: [{ name: 'q1', type: 'text' }] }],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'MISSING_PAGE_ID'),
            ).toBe(true);
        });

        it('errors when question has no id or name', () => {
            const result = service.validateSchema({
                pages: [{ name: 'p1', elements: [{ type: 'text' }] }],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'MISSING_QUESTION_ID'),
            ).toBe(true);
        });

        it('warns on unknown question type', () => {
            const result = service.validateSchema({
                pages: [
                    {
                        name: 'p1',
                        elements: [{ name: 'q1', type: 'foobar_unknown' }],
                    },
                ],
            });
            expect(result.valid).toBe(true);
            expect(
                result.warnings.some((w) => w.code === 'UNKNOWN_QUESTION_TYPE'),
            ).toBe(true);
        });

        it('accepts all standard SurveyJS types', () => {
            const surveyJsTypes = [
                'radiogroup',
                'checkbox',
                'dropdown',
                'text',
                'comment',
                'rating',
                'boolean',
                'matrix',
                'ranking',
                'file',
                'signaturepad',
            ];
            for (const type of surveyJsTypes) {
                const result = service.validateSchema({
                    pages: [{ name: 'p1', elements: [{ name: 'q1', type }] }],
                });
                expect(
                    result.warnings.some(
                        (w) => w.code === 'UNKNOWN_QUESTION_TYPE',
                    ),
                ).toBe(false);
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
            expect(service.extractQuestionIds({ pages: [] } as never)).toEqual(
                [],
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateSchema — edge cases
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateSchema — edge cases', () => {
        it('rejects non-string version field', () => {
            const result = service.validateSchema({
                version: 42,
                pages: [
                    { name: 'p1', elements: [{ name: 'q1', type: 'text' }] },
                ],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'INVALID_VERSION_TYPE'),
            ).toBe(true);
        });

        it('rejects pages that is not an array', () => {
            const result = service.validateSchema({ pages: 'not-an-array' });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'INVALID_PAGES_TYPE'),
            ).toBe(true);
        });

        it('rejects a page that is not an object', () => {
            const result = service.validateSchema({ pages: ['not-an-object'] });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'INVALID_PAGE_TYPE'),
            ).toBe(true);
        });

        it('rejects a page with missing questions/elements', () => {
            const result = service.validateSchema({ pages: [{ name: 'p1' }] });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'MISSING_QUESTIONS'),
            ).toBe(true);
        });

        it('rejects elements that is not an array', () => {
            const result = service.validateSchema({
                pages: [{ name: 'p1', elements: 'bad' }],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'INVALID_QUESTIONS_TYPE'),
            ).toBe(true);
        });

        it('rejects a question that is not an object', () => {
            const result = service.validateSchema({
                pages: [{ name: 'p1', elements: ['not-an-object'] }],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'INVALID_QUESTION_TYPE'),
            ).toBe(true);
        });

        it('rejects a question with missing type', () => {
            const result = service.validateSchema({
                pages: [{ name: 'p1', elements: [{ name: 'q1' }] }],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'MISSING_QUESTION_TYPE'),
            ).toBe(true);
        });

        it('rejects a question with non-string type', () => {
            const result = service.validateSchema({
                pages: [{ name: 'p1', elements: [{ name: 'q1', type: 99 }] }],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some(
                    (e) => e.code === 'INVALID_QUESTION_TYPE_TYPE',
                ),
            ).toBe(true);
        });

        it('rejects a question with non-string title', () => {
            const result = service.validateSchema({
                pages: [
                    {
                        name: 'p1',
                        elements: [{ name: 'q1', type: 'text', title: 42 }],
                    },
                ],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some(
                    (e) => e.code === 'INVALID_QUESTION_TITLE_TYPE',
                ),
            ).toBe(true);
        });

        it('rejects non-array choices on choice questions', () => {
            const result = service.validateSchema({
                pages: [
                    {
                        name: 'p1',
                        elements: [
                            { name: 'q1', type: 'radiogroup', choices: 'bad' },
                        ],
                    },
                ],
            });
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.code === 'INVALID_CHOICES_TYPE'),
            ).toBe(true);
        });

        it('accepts choice questions with an array choices', () => {
            const result = service.validateSchema({
                pages: [
                    {
                        name: 'p1',
                        elements: [
                            {
                                name: 'q1',
                                type: 'checkbox',
                                choices: ['a', 'b'],
                            },
                        ],
                    },
                ],
            });
            expect(result.valid).toBe(true);
        });

        it('accepts rating / matrix without extra fields', () => {
            const result = service.validateSchema({
                pages: [
                    {
                        name: 'p1',
                        elements: [
                            { name: 'q1', type: 'rating' },
                            { name: 'q2', type: 'matrix' },
                        ],
                    },
                ],
            });
            expect(result.valid).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // extractPageIds
    // ──────────────────────────────────────────────────────────────────────────

    describe('extractPageIds', () => {
        it('extracts page IDs using name or id', () => {
            const ids = service.extractPageIds({
                pages: [
                    { name: 'p1', elements: [] },
                    { id: 'p2', questions: [] },
                ],
            } as never);
            expect(ids).toEqual(['p1', 'p2']);
        });

        it('returns empty array when pages is missing', () => {
            expect(service.extractPageIds({} as never)).toEqual([]);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // getQuestionById
    // ──────────────────────────────────────────────────────────────────────────

    describe('getQuestionById', () => {
        it('finds question by name', () => {
            const q = service.getQuestionById(minimalSchema as never, 'q1');
            expect(q).toBeTruthy();
            expect((q as Record<string, unknown>).name).toBe('q1');
        });

        it('finds question by id field', () => {
            const schema = {
                pages: [
                    { name: 'p1', elements: [{ id: 'myq', type: 'text' }] },
                ],
            };
            const q = service.getQuestionById(schema as never, 'myq');
            expect(q).toBeTruthy();
        });

        it('returns null when question not found', () => {
            const q = service.getQuestionById(
                minimalSchema as never,
                'nonexistent',
            );
            expect(q).toBeNull();
        });

        it('returns null when schema has no pages', () => {
            const q = service.getQuestionById({} as never, 'q1');
            expect(q).toBeNull();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // getPageById
    // ──────────────────────────────────────────────────────────────────────────

    describe('getPageById', () => {
        it('finds page by name', () => {
            const page = service.getPageById(minimalSchema as never, 'page1');
            expect(page).toBeTruthy();
        });

        it('finds page by id field', () => {
            const schema = { pages: [{ id: 'mypage', elements: [] }] };
            const page = service.getPageById(schema as never, 'mypage');
            expect(page).toBeTruthy();
        });

        it('returns null/undefined when page not found', () => {
            const page = service.getPageById(
                minimalSchema as never,
                'nonexistent',
            );
            expect(page).toBeFalsy();
        });

        it('returns null when schema has no pages', () => {
            const page = service.getPageById({} as never, 'p1');
            expect(page).toBeNull();
        });
    });
});
