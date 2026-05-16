/**
 * Comprehensive coverage for all logic rule types and all comparison operators.
 *
 * Why unit tests (not integration):
 * - LogicEngineService is pure business logic with no DB dependency.
 * - All inputs and outputs are plain JS objects — no HTTP layer needed.
 * - Unit tests run in ~2s vs ~30s+ for a container-backed integration test.
 */

import { Test } from '@nestjs/testing';
import { LogicEngineService } from '../../../src/schema/services/logic-engine.service';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';
import {
    ComparisonOperator,
    LogicalOperator,
    RuleType,
    LogicSchema,
} from '../../../src/schema/interfaces/logic-rules.interface';
import { SurveySchema } from '../../../src/schema/interfaces/survey-schema.interface';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const schema: SurveySchema = {
    version: '1.0',
    pages: [
        {
            id: 'p1',
            title: 'Page 1',
            questions: [
                { id: 'q1', type: 'text' as never, title: 'Q1' },
                { id: 'q2', type: 'text' as never, title: 'Q2' },
                { id: 'q3', type: 'text' as never, title: 'Q3' },
                { id: 'q4', type: 'text' as never, title: 'Q4' },
            ],
        },
        {
            id: 'p2',
            title: 'Page 2',
            questions: [
                { id: 'q5', type: 'text' as never, title: 'Q5' },
                { id: 'q6', type: 'text' as never, title: 'Q6' },
            ],
        },
    ],
};

function rule(
    id: string,
    conditionQuestionId: string,
    operator: ComparisonOperator,
    value: unknown,
    actionType: RuleType,
    targetId: string,
    targetType: 'question' | 'page' = 'question',
    extra: Record<string, unknown> = {},
): LogicSchema {
    return {
        version: '1.0',
        rules: [
            {
                id,
                condition: { questionId: conditionQuestionId, operator, value },
                action: { type: actionType, targetId, targetType, ...extra },
            },
        ],
    };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('LogicEngineService — rule types & operators', () => {
    let service: LogicEngineService;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [SchemaValidatorService, LogicEngineService],
        }).compile();
        service = module.get(LogicEngineService);
    });

    // ─── Rule type: VISIBILITY ────────────────────────────────────────────────

    describe('VISIBILITY rule', () => {
        it('hides a question when condition is met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                RuleType.VISIBILITY,
                'q2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'yes' });
            expect(r.hiddenQuestions).toContain('q2');
            expect(r.visibleQuestions).not.toContain('q2');
        });

        it('keeps question visible when condition is NOT met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                RuleType.VISIBILITY,
                'q2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'no' });
            expect(r.visibleQuestions).toContain('q2');
            expect(r.hiddenQuestions).not.toContain('q2');
        });

        it('hides a page when condition is met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'skip',
                RuleType.VISIBILITY,
                'p2',
                'page',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'skip' });
            expect(r.hiddenPages).toContain('p2');
            expect(r.visiblePages).not.toContain('p2');
        });

        it('does not hide the same question twice', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                    {
                        id: 'r2',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.hiddenQuestions.filter((id) => id === 'q2')).toHaveLength(
                1,
            );
        });
    });

    // ─── Rule type: SKIP ──────────────────────────────────────────────────────

    describe('SKIP rule', () => {
        it('hides the target question when condition is met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'skip',
                RuleType.SKIP,
                'q3',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'skip' });
            expect(r.hiddenQuestions).toContain('q3');
        });

        it('hides the target page when targetType is page', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'skip',
                RuleType.SKIP,
                'p2',
                'page',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'skip' });
            expect(r.hiddenPages).toContain('p2');
        });

        it('does not skip when condition is not met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'skip',
                RuleType.SKIP,
                'q3',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'other' });
            expect(r.hiddenQuestions).not.toContain('q3');
        });
    });

    // ─── Rule type: REQUIRED ──────────────────────────────────────────────────

    describe('REQUIRED rule', () => {
        it('adds target to requiredQuestions when condition is met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                RuleType.REQUIRED,
                'q2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'yes' });
            expect(r.requiredQuestions).toContain('q2');
        });

        it('does not add to required when condition is not met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                RuleType.REQUIRED,
                'q2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'no' });
            expect(r.requiredQuestions).not.toContain('q2');
        });

        it('does not add hidden questions to requiredQuestions via getRequiredQuestions', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                    {
                        id: 'r2',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const required = service.getRequiredQuestions(schema, logic, {
                q1: 'x',
            });
            expect(required).not.toContain('q2');
        });
    });

    // ─── Rule type: VALIDATION ────────────────────────────────────────────────

    describe('VALIDATION rule', () => {
        it('adds validation error message when condition is met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'bad',
                RuleType.VALIDATION,
                'q2',
                'question',
                { value: 'This answer is not allowed' },
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'bad' });
            expect(r.validationErrors['q2']).toBe('This answer is not allowed');
        });

        it('does not add validation error when condition is not met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'bad',
                RuleType.VALIDATION,
                'q2',
                'question',
                { value: 'Not allowed' },
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'good' });
            expect(r.validationErrors['q2']).toBeUndefined();
        });

        it('ignores non-string validation message', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VALIDATION,
                            targetId: 'q2',
                            targetType: 'question',
                            value: 123,
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.validationErrors['q2']).toBeUndefined();
        });
    });

    // ─── Rule type: CALCULATED ────────────────────────────────────────────────

    describe('CALCULATED rule', () => {
        it('evaluates expression and stores result', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.CALCULATED,
                            targetId: 'total',
                            targetType: 'question',
                            expression: '{q1} + {q2}',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 3, q2: 7 });
            expect(r.calculatedValues['total']).toBe(10);
        });

        it('uses static value when no expression is provided', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.CALCULATED,
                            targetId: 'label',
                            targetType: 'question',
                            value: 'static',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'anything' });
            expect(r.calculatedValues['label']).toBe('static');
        });

        it('stores null when expression is invalid', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.CALCULATED,
                            targetId: 'x',
                            targetType: 'question',
                            expression: '{unclosed',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'y' });
            expect(r.calculatedValues['x']).toBeNull();
        });
    });

    // ─── Rule type: JUMP ──────────────────────────────────────────────────────

    describe('JUMP rule', () => {
        it('sets jumpTarget when condition is met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'done',
                RuleType.JUMP,
                'p2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'done' });
            expect(r.jumpTarget).toBe('p2');
        });

        it('does not set jumpTarget when condition is not met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'done',
                RuleType.JUMP,
                'p2',
            );
            const r = service.evaluateLogic(schema, logic, {
                q1: 'still going',
            });
            expect(r.jumpTarget).toBeUndefined();
        });
    });

    // ─── Comparison operators ─────────────────────────────────────────────────

    describe('comparison operators — string / text answers', () => {
        const hide = (
            op: ComparisonOperator,
            val: unknown,
            answer: Record<string, unknown>,
        ) =>
            service
                .evaluateLogic(
                    schema,
                    rule('r', 'q1', op, val, RuleType.VISIBILITY, 'q2'),
                    answer,
                )
                .hiddenQuestions.includes('q2');

        it('EQUALS — matches', () =>
            expect(hide(ComparisonOperator.EQUALS, 'yes', { q1: 'yes' })).toBe(
                true,
            ));
        it('EQUALS — no match', () =>
            expect(hide(ComparisonOperator.EQUALS, 'yes', { q1: 'no' })).toBe(
                false,
            ));

        it('NOT_EQUALS — matches', () =>
            expect(
                hide(ComparisonOperator.NOT_EQUALS, 'yes', { q1: 'no' }),
            ).toBe(true));
        it('NOT_EQUALS — no match', () =>
            expect(
                hide(ComparisonOperator.NOT_EQUALS, 'yes', { q1: 'yes' }),
            ).toBe(false));

        it('CONTAINS — matches substring', () =>
            expect(
                hide(ComparisonOperator.CONTAINS, 'ello', {
                    q1: 'hello world',
                }),
            ).toBe(true));
        it('CONTAINS — no match', () =>
            expect(
                hide(ComparisonOperator.CONTAINS, 'xyz', { q1: 'hello' }),
            ).toBe(false));

        it('NOT_CONTAINS — matches when absent', () =>
            expect(
                hide(ComparisonOperator.NOT_CONTAINS, 'xyz', { q1: 'hello' }),
            ).toBe(true));
        it('NOT_CONTAINS — no match when present', () =>
            expect(
                hide(ComparisonOperator.NOT_CONTAINS, 'hello', {
                    q1: 'hello world',
                }),
            ).toBe(false));

        it('STARTS_WITH — matches', () =>
            expect(
                hide(ComparisonOperator.STARTS_WITH, 'hel', { q1: 'hello' }),
            ).toBe(true));
        it('STARTS_WITH — no match', () =>
            expect(
                hide(ComparisonOperator.STARTS_WITH, 'world', { q1: 'hello' }),
            ).toBe(false));

        it('ENDS_WITH — matches', () =>
            expect(
                hide(ComparisonOperator.ENDS_WITH, 'rld', { q1: 'world' }),
            ).toBe(true));
        it('ENDS_WITH — no match', () =>
            expect(
                hide(ComparisonOperator.ENDS_WITH, 'hel', { q1: 'world' }),
            ).toBe(false));

        it('IS_EMPTY — matches empty string', () =>
            expect(
                hide(ComparisonOperator.IS_EMPTY, undefined, { q1: '' }),
            ).toBe(true));
        it('IS_EMPTY — matches null', () =>
            expect(
                hide(ComparisonOperator.IS_EMPTY, undefined, { q1: null }),
            ).toBe(true));
        it('IS_EMPTY — matches undefined', () =>
            expect(hide(ComparisonOperator.IS_EMPTY, undefined, {})).toBe(
                true,
            ));
        it('IS_EMPTY — no match when filled', () =>
            expect(
                hide(ComparisonOperator.IS_EMPTY, undefined, { q1: 'value' }),
            ).toBe(false));

        it('IS_NOT_EMPTY — matches when filled', () =>
            expect(
                hide(ComparisonOperator.IS_NOT_EMPTY, undefined, {
                    q1: 'value',
                }),
            ).toBe(true));
        it('IS_NOT_EMPTY — no match when empty', () =>
            expect(hide(ComparisonOperator.IS_NOT_EMPTY, undefined, {})).toBe(
                false,
            ));

        it('IN — matches array membership', () =>
            expect(
                hide(ComparisonOperator.IN, ['a', 'b', 'c'], { q1: 'b' }),
            ).toBe(true));
        it('IN — no match when not in array', () =>
            expect(hide(ComparisonOperator.IN, ['a', 'b'], { q1: 'z' })).toBe(
                false,
            ));
        it('IN — no match when compareValue is not array', () =>
            expect(hide(ComparisonOperator.IN, 'not-array', { q1: 'a' })).toBe(
                false,
            ));

        it('NOT_IN — matches when absent from array', () =>
            expect(
                hide(ComparisonOperator.NOT_IN, ['a', 'b'], { q1: 'z' }),
            ).toBe(true));
        it('NOT_IN — no match when present in array', () =>
            expect(
                hide(ComparisonOperator.NOT_IN, ['a', 'b'], { q1: 'a' }),
            ).toBe(false));

        it('MATCHES — matches valid regex', () =>
            expect(
                hide(ComparisonOperator.MATCHES, '^[0-9]+$', { q1: '42' }),
            ).toBe(true));
        it('MATCHES — no match on fail', () =>
            expect(
                hide(ComparisonOperator.MATCHES, '^[0-9]+$', { q1: 'abc' }),
            ).toBe(false));
        it('MATCHES — returns false on invalid regex', () =>
            expect(
                hide(ComparisonOperator.MATCHES, '[invalid', { q1: 'test' }),
            ).toBe(false));
    });

    describe('comparison operators — numeric answers', () => {
        const hide = (
            op: ComparisonOperator,
            val: unknown,
            answer: Record<string, unknown>,
        ) =>
            service
                .evaluateLogic(
                    schema,
                    rule('r', 'q1', op, val, RuleType.VISIBILITY, 'q2'),
                    answer,
                )
                .hiddenQuestions.includes('q2');

        it('GREATER_THAN — matches', () =>
            expect(hide(ComparisonOperator.GREATER_THAN, 5, { q1: 10 })).toBe(
                true,
            ));
        it('GREATER_THAN — no match', () =>
            expect(hide(ComparisonOperator.GREATER_THAN, 10, { q1: 5 })).toBe(
                false,
            ));
        it('GREATER_THAN — no match on equal', () =>
            expect(hide(ComparisonOperator.GREATER_THAN, 5, { q1: 5 })).toBe(
                false,
            ));

        it('GREATER_THAN_OR_EQUALS — matches on equal', () =>
            expect(
                hide(ComparisonOperator.GREATER_THAN_OR_EQUALS, 5, { q1: 5 }),
            ).toBe(true));
        it('GREATER_THAN_OR_EQUALS — matches on greater', () =>
            expect(
                hide(ComparisonOperator.GREATER_THAN_OR_EQUALS, 5, { q1: 6 }),
            ).toBe(true));
        it('GREATER_THAN_OR_EQUALS — no match', () =>
            expect(
                hide(ComparisonOperator.GREATER_THAN_OR_EQUALS, 5, { q1: 4 }),
            ).toBe(false));

        it('LESS_THAN — matches', () =>
            expect(hide(ComparisonOperator.LESS_THAN, 10, { q1: 5 })).toBe(
                true,
            ));
        it('LESS_THAN — no match on equal', () =>
            expect(hide(ComparisonOperator.LESS_THAN, 5, { q1: 5 })).toBe(
                false,
            ));

        it('LESS_THAN_OR_EQUALS — matches on equal', () =>
            expect(
                hide(ComparisonOperator.LESS_THAN_OR_EQUALS, 5, { q1: 5 }),
            ).toBe(true));
        it('LESS_THAN_OR_EQUALS — matches on less', () =>
            expect(
                hide(ComparisonOperator.LESS_THAN_OR_EQUALS, 5, { q1: 4 }),
            ).toBe(true));
        it('LESS_THAN_OR_EQUALS — no match', () =>
            expect(
                hide(ComparisonOperator.LESS_THAN_OR_EQUALS, 5, { q1: 6 }),
            ).toBe(false));

        it('compares string-encoded numbers correctly', () => {
            expect(hide(ComparisonOperator.GREATER_THAN, 5, { q1: '10' })).toBe(
                true,
            );
        });
    });

    describe('comparison operators — arrays (CONTAINS on array haystack)', () => {
        const hide = (
            op: ComparisonOperator,
            val: unknown,
            answer: Record<string, unknown>,
        ) =>
            service
                .evaluateLogic(
                    schema,
                    rule('r', 'q1', op, val, RuleType.VISIBILITY, 'q2'),
                    answer,
                )
                .hiddenQuestions.includes('q2');

        it('CONTAINS — matches when needle is in array answer', () => {
            expect(
                hide(ComparisonOperator.CONTAINS, 'b', { q1: ['a', 'b', 'c'] }),
            ).toBe(true);
        });

        it('CONTAINS — no match when needle absent from array', () => {
            expect(
                hide(ComparisonOperator.CONTAINS, 'z', { q1: ['a', 'b'] }),
            ).toBe(false);
        });

        it('EQUALS — two arrays with same values match', () => {
            expect(
                hide(ComparisonOperator.EQUALS, ['a', 'b'], { q1: ['a', 'b'] }),
            ).toBe(true);
        });
    });

    // ─── Condition groups (AND / OR) ──────────────────────────────────────────

    describe('condition groups', () => {
        it('AND group — hides only when both conditions are met', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            operator: LogicalOperator.AND,
                            conditions: [
                                {
                                    questionId: 'q1',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'yes',
                                },
                                {
                                    questionId: 'q2',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'yes',
                                },
                            ],
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q3',
                            targetType: 'question',
                        },
                    },
                ],
            };
            expect(
                service.evaluateLogic(schema, logic, { q1: 'yes', q2: 'yes' })
                    .hiddenQuestions,
            ).toContain('q3');
            expect(
                service.evaluateLogic(schema, logic, { q1: 'yes', q2: 'no' })
                    .hiddenQuestions,
            ).not.toContain('q3');
            expect(
                service.evaluateLogic(schema, logic, { q1: 'no', q2: 'yes' })
                    .hiddenQuestions,
            ).not.toContain('q3');
        });

        it('OR group — hides when either condition is met', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            operator: LogicalOperator.OR,
                            conditions: [
                                {
                                    questionId: 'q1',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'a',
                                },
                                {
                                    questionId: 'q2',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'b',
                                },
                            ],
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q3',
                            targetType: 'question',
                        },
                    },
                ],
            };
            expect(
                service.evaluateLogic(schema, logic, { q1: 'a', q2: 'x' })
                    .hiddenQuestions,
            ).toContain('q3');
            expect(
                service.evaluateLogic(schema, logic, { q1: 'x', q2: 'b' })
                    .hiddenQuestions,
            ).toContain('q3');
            expect(
                service.evaluateLogic(schema, logic, { q1: 'x', q2: 'x' })
                    .hiddenQuestions,
            ).not.toContain('q3');
        });

        it('nested condition groups — AND inside OR', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            operator: LogicalOperator.OR,
                            conditions: [
                                {
                                    questionId: 'q1',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'direct',
                                },
                                {
                                    operator: LogicalOperator.AND,
                                    conditions: [
                                        {
                                            questionId: 'q2',
                                            operator: ComparisonOperator.EQUALS,
                                            value: 'a',
                                        },
                                        {
                                            questionId: 'q3',
                                            operator: ComparisonOperator.EQUALS,
                                            value: 'b',
                                        },
                                    ],
                                },
                            ],
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q4',
                            targetType: 'question',
                        },
                    },
                ],
            };
            // outer OR: first branch passes
            expect(
                service.evaluateLogic(schema, logic, { q1: 'direct' })
                    .hiddenQuestions,
            ).toContain('q4');
            // outer OR: nested AND passes (both q2 and q3 match)
            expect(
                service.evaluateLogic(schema, logic, {
                    q1: 'x',
                    q2: 'a',
                    q3: 'b',
                }).hiddenQuestions,
            ).toContain('q4');
            // neither branch passes
            expect(
                service.evaluateLogic(schema, logic, {
                    q1: 'x',
                    q2: 'a',
                    q3: 'x',
                }).hiddenQuestions,
            ).not.toContain('q4');
        });
    });

    // ─── Rule priority ────────────────────────────────────────────────────────

    describe('rule priority', () => {
        it('higher-priority rule action is applied first (both fire when conditions met)', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'low',
                        priority: 1,
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                    {
                        id: 'high',
                        priority: 10,
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q3',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.requiredQuestions).toContain('q2');
            expect(r.hiddenQuestions).toContain('q3');
            // both rule results are present
            expect(r.ruleResults).toHaveLength(2);
        });

        it('rules without priority are treated as priority 0', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.ruleResults[0].ruleId).toBe('r1');
        });
    });

    // ─── Disabled rules ───────────────────────────────────────────────────────

    describe('disabled rules', () => {
        it('skips a rule with enabled: false', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        enabled: false,
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.hiddenQuestions).not.toContain('q2');
            expect(r.ruleResults).toHaveLength(0);
        });

        it('evaluates a rule with enabled: true normally', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        enabled: true,
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.hiddenQuestions).toContain('q2');
        });
    });

    // ─── Multiple interacting rules ───────────────────────────────────────────

    describe('multiple rules', () => {
        it('applies all matching rules independently', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                    {
                        id: 'r2',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q3',
                            targetType: 'question',
                        },
                    },
                    {
                        id: 'r3',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'x',
                        },
                        action: {
                            type: RuleType.JUMP,
                            targetId: 'p2',
                            targetType: 'page',
                        },
                    },
                ],
            };
            const r = service.evaluateLogic(schema, logic, { q1: 'x' });
            expect(r.hiddenQuestions).toContain('q2');
            expect(r.requiredQuestions).toContain('q3');
            expect(r.jumpTarget).toBe('p2');
        });

        it('records conditionMet=false in ruleResults when condition not met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                RuleType.VISIBILITY,
                'q2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'no' });
            expect(r.ruleResults[0].conditionMet).toBe(false);
        });

        it('records conditionMet=true in ruleResults when condition met', () => {
            const logic = rule(
                'r1',
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                RuleType.VISIBILITY,
                'q2',
            );
            const r = service.evaluateLogic(schema, logic, { q1: 'yes' });
            expect(r.ruleResults[0].conditionMet).toBe(true);
        });
    });

    // ─── getRequiredQuestions ─────────────────────────────────────────────────

    describe('getRequiredQuestions', () => {
        it('includes schema-required questions that are visible', () => {
            const schemaWithRequired: SurveySchema = {
                version: '1.0',
                pages: [
                    {
                        id: 'p1',
                        title: 'P1',
                        questions: [
                            {
                                id: 'q1',
                                type: 'text' as never,
                                title: 'Q1',
                                validation: { required: true },
                            },
                            { id: 'q2', type: 'text' as never, title: 'Q2' },
                        ],
                    },
                ],
            };
            const required = service.getRequiredQuestions(
                schemaWithRequired,
                null,
                {},
            );
            expect(required).toContain('q1');
            expect(required).not.toContain('q2');
        });

        it('excludes schema-required questions that are hidden by a rule', () => {
            const schemaWithRequired: SurveySchema = {
                version: '1.0',
                pages: [
                    {
                        id: 'p1',
                        title: 'P1',
                        questions: [
                            {
                                id: 'q1',
                                type: 'text' as never,
                                title: 'Q1',
                                validation: { required: true },
                            },
                            { id: 'q2', type: 'text' as never, title: 'Q2' },
                        ],
                    },
                ],
            };
            const logic = rule(
                'r1',
                'q2',
                ComparisonOperator.EQUALS,
                'hide',
                RuleType.VISIBILITY,
                'q1',
            );
            const required = service.getRequiredQuestions(
                schemaWithRequired,
                logic,
                { q2: 'hide' },
            );
            expect(required).not.toContain('q1');
        });

        it('merges logic-required and schema-required without duplicates', () => {
            const schemaWithRequired: SurveySchema = {
                version: '1.0',
                pages: [
                    {
                        id: 'p1',
                        title: 'P1',
                        questions: [
                            {
                                id: 'q1',
                                type: 'text' as never,
                                title: 'Q1',
                                validation: { required: true },
                            },
                            { id: 'q2', type: 'text' as never, title: 'Q2' },
                        ],
                    },
                ],
            };
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    // q1 is already schema-required; add it via logic too
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q2',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q1',
                            targetType: 'question',
                        },
                    },
                    {
                        id: 'r2',
                        condition: {
                            questionId: 'q2',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const required = service.getRequiredQuestions(
                schemaWithRequired,
                logic,
                { q2: 'filled' },
            );
            expect(required.filter((id) => id === 'q1')).toHaveLength(1);
            expect(required).toContain('q2');
        });
    });
});
